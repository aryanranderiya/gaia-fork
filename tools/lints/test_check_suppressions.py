"""Behaviour tests for tools/lints/check_suppressions.py.

The checker replaces a git-archaeology ratchet with a checked-in baseline, so
the cases that matter are the ones proving each of the old bugs is actually
fixed: a pure rename must not false-fail, a genuine new suppression must fail
with an exact file:line, and a baseline that has grown stale (more than the
tree now has) must fail too — the monotonic-shrink half of the contract.

Runs the real script via subprocess against a throwaway git repo (``git
ls-files`` is how it discovers what to scan), mirroring the sibling
``check_ignore_ratchet.py``'s dependence on a real ``pyproject.toml``.
"""

from __future__ import annotations

import json
from pathlib import Path
import shutil
import subprocess

import pytest

_HERE = Path(__file__).resolve().parent
SCRIPT = _HERE / "check_suppressions.py"
COMMON = _HERE / "_common.py"


def _git(repo: Path, *args: str) -> None:
    subprocess.run(["git", *args], cwd=repo, check=True, capture_output=True)


@pytest.fixture
def repo(tmp_path: Path) -> Path:
    """A throwaway git repo with the script installed at the same relative
    path it lives at in this repo, so ``REPO_ROOT`` (two parents up from
    ``__file__``) resolves to ``tmp_path``.
    """
    lints_dir = tmp_path / "tools" / "lints"
    lints_dir.mkdir(parents=True)
    shutil.copy(SCRIPT, lints_dir / "check_suppressions.py")
    shutil.copy(COMMON, lints_dir / "_common.py")
    # The tool's own docstrings mention the suppression syntax as prose, which
    # the naive line scanner cannot distinguish from a real suppression (same
    # limitation the old script had). Untracked here so it never enters the
    # scan — tests exercise the scanner against their own fixture files.
    (tmp_path / ".gitignore").write_text("/tools/\n")
    _git(tmp_path, "init", "-q", ".")
    _git(tmp_path, "config", "user.email", "t@t.t")
    _git(tmp_path, "config", "user.name", "t")
    return tmp_path


def _commit(repo: Path, message: str = "change") -> None:
    _git(repo, "add", "-A")
    _git(repo, "commit", "-qm", message)


def run(repo: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", "tools/lints/check_suppressions.py", *args],
        cwd=repo,
        capture_output=True,
        text=True,
        check=False,
    )


def test_clean_tree_passes(repo: Path) -> None:
    (repo / "a.py").write_text("x = 1\n")
    _commit(repo)
    r = run(repo, "--update")
    assert r.returncode == 0
    r = run(repo)
    assert r.returncode == 0
    assert "OK" in r.stdout


def test_new_suppression_fails_with_correct_line(repo: Path) -> None:
    (repo / "a.py").write_text("x = 1\ny = 2\n")
    _commit(repo)
    assert run(repo, "--update").returncode == 0

    (repo / "a.py").write_text("x = 1\ny = 2  # noqa: E501\n")
    _commit(repo)
    r = run(repo)
    assert r.returncode == 1
    assert "a.py:2" in r.stderr
    assert "::error file=a.py,line=2::" in r.stdout


def test_stale_entry_fails(repo: Path) -> None:
    (repo / "a.py").write_text("x = 1  # noqa: E501\n")
    _commit(repo)
    assert run(repo, "--update").returncode == 0

    baseline_path = repo / "config" / "suppressions-baseline.json"
    data = json.loads(baseline_path.read_text())
    data["entries"][0]["count"] += 1
    baseline_path.write_text(json.dumps(data, indent=2) + "\n")
    _commit(repo, "inflate baseline")

    r = run(repo)
    assert r.returncode == 1
    assert "stale baseline entry" in r.stderr
    assert "a.py" in r.stderr


def test_update_roundtrip(repo: Path) -> None:
    (repo / "a.py").write_text("x = 1  # noqa: E501\n")
    (repo / "b.ts").write_text("// biome-ignore lint: x\nconst x = 1\n")
    _commit(repo)

    r = run(repo, "--update")
    assert r.returncode == 0
    baseline_path = repo / "config" / "suppressions-baseline.json"
    data = json.loads(baseline_path.read_text())
    kinds = {(e["path"], e["kind"]): e["count"] for e in data["entries"]}
    assert kinds == {("a.py", "noqa"): 1, ("b.ts", "biome-ignore"): 1}

    # Roundtrip: checking immediately after --update is clean.
    assert run(repo).returncode == 0


def test_renamed_file_passes_without_baseline_change(repo: Path) -> None:
    (repo / "a.py").write_text("x = 1  # noqa: E501\ny = 2  # type: ignore\n")
    _commit(repo)
    assert run(repo, "--update").returncode == 0

    _git(repo, "mv", "a.py", "renamed.py")
    _commit(repo, "rename")

    r = run(repo)
    assert r.returncode == 0
    assert "OK" in r.stdout


def test_renamed_and_edited_file_is_not_treated_as_a_free_rename(repo: Path) -> None:
    """A rename alone is free; a rename that also adds a suppression is not —
    content-hash matching only fires on byte-identical content."""
    (repo / "a.py").write_text("x = 1  # noqa: E501\n")
    _commit(repo)
    assert run(repo, "--update").returncode == 0

    _git(repo, "mv", "a.py", "renamed.py")
    (repo / "renamed.py").write_text("x = 1  # noqa: E501\ny = 2  # noqa: F401\n")
    _commit(repo, "rename and add a suppression")

    r = run(repo)
    assert r.returncode == 1
    assert "renamed.py" in r.stderr
