"use client";

import { PackageOpenIcon } from "@icons";
import { ANALYTICS_EVENTS, trackEvent } from "@/lib/analytics";
import { useWhatsNewStore } from "@/stores/whatsNewStore";
import { useReleases } from "../hooks/useReleases";
import { formatReleaseDate } from "../utils/formatReleaseDate";

const VISIBLE_COUNT = 6;

interface WhatsNewTimelineMenuProps {
  onClose?: () => void;
}

export function WhatsNewTimelineMenu({ onClose }: WhatsNewTimelineMenuProps) {
  const { releases, unseen, isLoading } = useReleases();
  const openModal = useWhatsNewStore((s) => s.openModal);

  if (isLoading || releases.length === 0) return null;

  const visible = releases.slice(0, VISIBLE_COUNT);

  const handleItemClick = (idx: number) => {
    trackEvent(ANALYTICS_EVENTS.WHATS_NEW_CARD_CLICKED, {
      releaseId: visible[idx]?.id,
      index: idx,
      source: "settings_menu",
    });
    openModal(idx);
    onClose?.();
  };

  const handleViewAll = () => {
    trackEvent(ANALYTICS_EVENTS.WHATS_NEW_CARD_CLICKED, {
      source: "settings_menu_view_all",
    });
    openModal(0);
    onClose?.();
  };

  return (
    // Inline width forces the tooltip to honour 260 px regardless of its own sizing strategy
    <div style={{ width: "260px" }} className="py-2">
      <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
        Recent updates
      </p>

      <div className="relative px-3">
        {/*
          Rail math:
            container px-3 = 12 px  |  button px-2 = 8 px  |  dot w-2 = 8 px
            dot left edge  = 12 + 8 = 20 px from outer border
            dot center     = 20 + 4 = 24 px  →  left-6 (24 px)
          ring-[#1a1a1a] matches bg-secondary-bg so the dot appears to
          thread onto the rail rather than sit on top of it.
        */}
        <div className="pointer-events-none absolute bottom-2 left-6 top-2 w-px -translate-x-1/2 bg-zinc-800" />

        <div className="flex flex-col">
          {visible.map((release, idx) => {
            const isUnseen = unseen.some((u) => u.id === release.id);
            return (
              <button
                key={release.id}
                type="button"
                onClick={() => handleItemClick(idx)}
                className="group relative flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-zinc-800/60"
              >
                {/* Timeline dot — ring creates the "threaded" look */}
                <div
                  className={[
                    "relative z-10 mt-[3px] h-2 w-2 shrink-0 rounded-full ring-2 ring-[#1a1a1a] transition-transform group-hover:scale-110",
                    idx === 0 ? "bg-primary" : "bg-zinc-600",
                  ].join(" ")}
                />

                {/* Content: date above title, Notion-style */}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="text-[10px] tabular-nums text-zinc-600 transition-colors group-hover:text-zinc-500">
                      {formatReleaseDate(release.date)}
                    </span>
                    {isUnseen && (
                      <span className="inline-block h-1 w-1 shrink-0 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="block text-xs leading-snug text-zinc-300 transition-colors group-hover:text-white">
                    {release.title}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer — plain text link, not a full-width button */}
      <div className="mt-2 border-t border-zinc-800/50 px-4 pt-2">
        <button
          type="button"
          onClick={handleViewAll}
          className="flex items-center gap-1.5 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <PackageOpenIcon className="h-3 w-3 shrink-0" />
          View all releases
        </button>
      </div>
    </div>
  );
}
