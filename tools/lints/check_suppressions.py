#!/usr/bin/env python3
"""Checked-in baseline for inline lint-suppression comments.

Replaces the old git-archaeology ratchet (``scripts/ci/check-suppression-ratchet.sh``),
which compared merge-base vs HEAD via git history and had four verified bugs: pure
renames false-failed (git's diff misattributed a phantom +1), a force-push crashed
it (``github.event.before`` unfetched), a same-file swap between suppression kinds
netted to zero and stayed invisible, and failures printed counts instead of lines.

This scans the CURRENT WORKING TREE instead of any git history — no fetch-depth,
no base ref, no merge-base. It counts three suppression kinds per tracked file:

    noqa           -- ``# noqa`` in *.py
    type-ignore    -- ``# type: ignore`` in *.py
    biome-ignore   -- ``// biome-ignore`` in ts/tsx/js/jsx/mjs/cjs

and compares the counts against ``config/suppressions-baseline.json``, one entry
per (path, kind). The baseline is line-number-free, so reordering lines within a
file is always free. A ``(path, kind)`` whose count grew beyond the baseline fails
as a new suppression; a baseline entry whose count exceeds what is in the tree
fails as stale (the baseline may only ever shrink).

A file that is purely renamed (byte-identical content, so every suppression moves
with it) is free too: each baseline entry records a sha256 of its file's full
content, and a vanished baseline path is remapped onto any current file with the
same hash before comparison — this is what actually fixes the old script's
"pure renames false-fail" bug, without ever touching git history.

Usage::

    python3 tools/lints/check_suppressions.py           # check (exits 1 on growth)
    python3 tools/lints/check_suppressions.py --update  # regenerate the baseline

Stdlib only, like the AST rules beside it.
"""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

from _common import Violation, report_rule

RULE = "suppression-baseline"
WHY = (
    "inline lint suppressions (# noqa / # type: ignore / // biome-ignore) are debt — "
    "the checked-in baseline lets existing ones stay grandfathered but blocks silent growth"
)
DOC = "tools/lints/README.md#suppression-baseline"

_HERE = Path(__file__).resolve().parent
REPO_ROOT = _HERE.parents[1]
BASELINE_PATH = REPO_ROOT / "config" / "suppressions-baseline.json"

_TS_SUFFIXES = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
_TRACKED_GLOBS = ("*.py", "*.ts", "*.tsx", "*.js", "*.jsx", "*.mjs", "*.cjs")

_NOQA_RE = re.compile(r"#\s*noqa\b")
_TYPE_IGNORE_RE = re.compile(r"#\s*type:\s*ignore\b")
_BIOME_IGNORE_RE = re.compile(r"//\s*biome-ignore\b")


@dataclass(frozen=True)
class Hit:
    """One suppression comment found in the tree."""

    kind: str
    line: int
    text: str


def _tracked_files() -> list[Path]:
    """Every git-tracked source file the scan cares about (skips untracked/ignored)."""
    git = shutil.which("git")
    if git is None:
        raise RuntimeError("git not found on PATH — the scanner needs `git ls-files`")
    out = subprocess.run(
        [git, "ls-files", "-z", "--", *_TRACKED_GLOBS],
        cwd=REPO_ROOT,
        check=True,
        capture_output=True,
    ).stdout
    return [REPO_ROOT / p for p in out.decode().split("\0") if p]


def _patterns_for(path: Path) -> tuple[tuple[str, re.Pattern[str]], ...]:
    if path.suffix == ".py":
        return (("noqa", _NOQA_RE), ("type-ignore", _TYPE_IGNORE_RE))
    if path.suffix in _TS_SUFFIXES:
        return (("biome-ignore", _BIOME_IGNORE_RE),)
    return ()


def _scan_file(path: Path) -> list[Hit]:
    patterns = _patterns_for(path)
    if not patterns:
        return []
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return []
    hits: list[Hit] = []
    for lineno, line in enumerate(text.splitlines(), start=1):
        for kind, pattern in patterns:
            if pattern.search(line):
                hits.append(Hit(kind, lineno, line.strip()))
    return hits


def scan_tree() -> tuple[dict[tuple[str, str], list[Hit]], dict[str, str]]:
    """Suppression hits grouped by (relpath, kind), plus a content hash per
    suppressed file (used only to recognize pure renames, see ``resolve_renames``).
    """
    grouped: dict[tuple[str, str], list[Hit]] = {}
    hashes: dict[str, str] = {}
    for path in _tracked_files():
        hits = _scan_file(path)
        if not hits:
            continue
        rel = path.relative_to(REPO_ROOT).as_posix()
        hashes[rel] = hashlib.sha256(path.read_bytes()).hexdigest()
        for hit in hits:
            grouped.setdefault((rel, hit.kind), []).append(hit)
    return grouped, hashes


def load_baseline() -> tuple[dict[tuple[str, str], int], dict[str, str]]:
    """Parse the checked-in baseline; a missing file is an empty baseline."""
    if not BASELINE_PATH.exists():
        return {}, {}
    data = json.loads(BASELINE_PATH.read_text(encoding="utf-8"))
    counts: dict[tuple[str, str], int] = {}
    hashes: dict[str, str] = {}
    for entry in data["entries"]:
        counts[(entry["path"], entry["kind"])] = entry["count"]
        hashes[entry["path"]] = entry["hash"]
    return counts, hashes


def write_baseline(grouped: dict[tuple[str, str], list[Hit]], hashes: dict[str, str]) -> None:
    """Regenerate the baseline file from the current tree (sorted, stable)."""
    entries = [
        {"path": path, "kind": kind, "count": len(hits), "hash": hashes[path]}
        for (path, kind), hits in grouped.items()
    ]
    entries.sort(key=lambda e: (e["path"], e["kind"]))
    BASELINE_PATH.parent.mkdir(parents=True, exist_ok=True)
    BASELINE_PATH.write_text(json.dumps({"entries": entries}, indent=2) + "\n", encoding="utf-8")


def resolve_renames(
    baseline_counts: dict[tuple[str, str], int],
    baseline_hashes: dict[str, str],
    current_hashes: dict[str, str],
) -> dict[tuple[str, str], int]:
    """Remap baseline entries whose path vanished onto a current path with
    byte-identical content — a pure rename, the one thing this check makes free
    across files (the old script's "pure renames false-fail" bug, fixed without
    touching git history: it's a content hash, not a diff).
    """
    current_by_hash = {h: p for p, h in current_hashes.items()}
    remapped = dict(baseline_counts)
    for old_path in [p for p in baseline_hashes if p not in current_hashes]:
        new_path = current_by_hash.get(baseline_hashes[old_path])
        if new_path is None or new_path in baseline_hashes:
            continue  # no unambiguous match — fall through to stale/new reporting
        for key in [k for k in remapped if k[0] == old_path]:
            remapped[(new_path, key[1])] = remapped.pop(key)
    return remapped


def _locate_baseline_line(path: str, kind: str) -> int:
    """1-based line in the baseline JSON for a (path, kind) entry, for GH annotations."""
    lines = BASELINE_PATH.read_text(encoding="utf-8").splitlines()
    for i, line in enumerate(lines):
        if f'"path": "{path}"' in line:
            for j in range(i, min(i + 4, len(lines))):
                if f'"kind": "{kind}"' in lines[j]:
                    return i + 1
    return 1


def main(argv: list[str]) -> int:
    """Compare the tree against the baseline; --update regenerates it."""
    grouped, current_hashes = scan_tree()
    current_counts = {key: len(hits) for key, hits in grouped.items()}

    if "--update" in argv:
        previous, _ = load_baseline()
        write_baseline(grouped, current_hashes)
        total = sum(current_counts.values())
        print(
            f"{RULE}: baseline updated — {total} suppression(s) across "
            f"{len({p for p, _ in current_counts})} file(s) "
            f"(+{len(set(current_counts) - set(previous))} / "
            f"-{len(set(previous) - set(current_counts))} entries). "
            "Commit the diff so the change is reviewable."
        )
        return 0

    baseline_counts, baseline_hashes = load_baseline()
    baseline_counts = resolve_renames(baseline_counts, baseline_hashes, current_hashes)

    violations: list[Violation] = []

    for key, count in sorted(current_counts.items()):
        base = baseline_counts.get(key, 0)
        if count <= base:
            continue
        path, kind = key
        # Line-number-free baseline means we can't know which specific lines
        # predate the baseline — report the last (count - base) occurrences in
        # file order, a deterministic stand-in for "the ones that are new".
        hits = sorted(grouped[key], key=lambda h: h.line)
        for hit in hits[base:]:
            print(f"::error file={path},line={hit.line}::new {kind} suppression")
            violations.append(
                Violation(
                    path=Path(path),
                    line=hit.line,
                    detail=f"[{kind}] {hit.text}",
                    fix=(
                        "delete it, or add it to config/suppressions-baseline.json in this "
                        "PR (the baseline edit is the review surface — justify it in the PR)"
                    ),
                )
            )

    for key, base in sorted(baseline_counts.items()):
        count = current_counts.get(key, 0)
        if base <= count:
            continue
        path, kind = key
        line = _locate_baseline_line(path, kind)
        print(
            f"::error file=config/suppressions-baseline.json,line={line}::stale entry for {path} [{kind}]"
        )
        violations.append(
            Violation(
                path=BASELINE_PATH,
                line=line,
                detail=f"stale baseline entry — {path} [{kind}]: baseline={base}, tree={count}",
                fix="shrink it — run `python3 tools/lints/check_suppressions.py --update`",
            )
        )

    if violations:
        report_rule(RULE, WHY, DOC, violations)
        print(
            f"\n{len(violations)} violation(s). New suppressions must be fixed or added to the "
            "baseline; stale entries must be shrunk with --update.",
            file=sys.stderr,
        )
        return 1

    total = sum(current_counts.values())
    print(f"{RULE}: OK — {total} suppression(s) tracked, none new, baseline tight")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
