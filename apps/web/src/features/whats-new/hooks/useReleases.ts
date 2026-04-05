"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWhatsNewStore } from "@/stores/whatsNewStore";
import type { Release, ReleasesResponse } from "../types";

const REVALIDATE_MS = 30 * 60 * 1000; // 30 minutes

let cachedData: ReleasesResponse | null = null;
let cachedAt = 0;

export function useReleases(): {
  releases: Release[];
  latest: Release | null;
  unseen: Release[];
  isLoading: boolean;
  error: Error | null;
} {
  const [releases, setReleases] = useState<Release[]>(
    cachedData?.releases ?? [],
  );
  const [isLoading, setIsLoading] = useState(cachedData === null);
  const [error, setError] = useState<Error | null>(null);

  const lastSeenReleaseId = useWhatsNewStore((s) => s.lastSeenReleaseId);
  const markAllSeen = useWhatsNewStore((s) => s.markAllSeen);
  const hasSeededRef = useRef(false);

  const fetchReleases = useCallback(async () => {
    const now = Date.now();
    if (cachedData && now - cachedAt < REVALIDATE_MS) {
      setReleases(cachedData.releases);
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/releases");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ReleasesResponse = await res.json();
      cachedData = data;
      cachedAt = now;
      setReleases(data.releases);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err : new Error("Failed to load releases"),
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReleases();

    const onFocus = () => {
      if (Date.now() - cachedAt >= REVALIDATE_MS) fetchReleases();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchReleases]);

  // First-run seeding: treat all but the latest release as already seen
  useEffect(() => {
    if (hasSeededRef.current) return;
    if (releases.length < 2) return;
    if (lastSeenReleaseId !== null) return;

    // Seed to second-most-recent so only 1 "New" badge shows on first load
    hasSeededRef.current = true;
    markAllSeen(releases[1].id);
  }, [releases, lastSeenReleaseId, markAllSeen]);

  const latest = releases[0] ?? null;

  const unseenDate = lastSeenReleaseId
    ? (releases.find((r) => r.id === lastSeenReleaseId)?.date ?? null)
    : null;

  const unseen = unseenDate
    ? releases.filter((r) => new Date(r.date) > new Date(unseenDate))
    : releases.slice(0, 1);

  return { releases, latest, unseen, isLoading, error };
}
