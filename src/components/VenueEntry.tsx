"use client";

import { useRef, useState } from "react";
import type { Zone } from "@/lib/booking";
import { dicts, type Lang } from "@/lib/i18n/dicts";

export type EntryShot = {
  key: string;
  /** «Фасад», «Внутри», or the hall's name. */
  label: string;
  src: string;
  srcSet?: string;
  caption: string | null;
  /** A picture made for a fictional demo venue, said so under it. */
  demo: boolean;
  hall: boolean;
  /** Places to sit on this hall (by the window, at the bar…), one tap from the plan. */
  zones: { z: Zone; label: string; n: number }[];
};

/**
 * Walking into a venue (15 Nov 2026, owner: «Ты туда нажимаешь, ты туда
 * заходишь. Виден экстерьер, виден интерьер, виден зал. Там можно увидеть, где
 * именно забронить»): the street front, then the room, then the hall, one
 * picture at a time in the paper frame of a plate. Moving on, the picture you
 * leave grows a little and fades, as if you stepped through it; going back
 * reverses it. On the hall the places to sit (by the window, at the bar…) are
 * one tap from the plan, where those tables light up.
 */
export function VenueEntry({
  shots,
  name,
  bookLabel,
  bg,
  lang,
}: {
  shots: EntryShot[];
  name: string;
  bookLabel: string;
  bg: string;
  lang: Lang;
}) {
  // Strings by language here: the step counter is a function, which cannot cross from the server.
  const s = dicts[lang].entry;
  const [at, setAt] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const n = shots.length;
  const shot = shots[at];
  const last = at === n - 1;
  const go = (i: number) => setAt(Math.max(0, Math.min(n - 1, i)));

  const toPlan = (z?: Zone) => {
    if (z) window.dispatchEvent(new CustomEvent("bolek:zone", { detail: z }));
    const target = document.getElementById(z ? "book-where" : "book");
    target?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };
  // The button names where it leads: «Зайти внутрь», then the hall itself («Терраса»).
  const nextShot = shots[at + 1];
  const nextLabel = nextShot && nextShot.hall ? nextShot.label : s.enter;

  return (
    <section aria-label={`${s.aria}: ${name}`} aria-roledescription="carousel" className="bg-paper p-2 sm:p-2.5">
      <div
        className="relative aspect-square touch-pan-y overflow-hidden sm:aspect-[4/5]"
        style={{ background: bg }}
        onPointerDown={(e) => (swipe.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => {
          const st = swipe.current;
          swipe.current = null;
          if (!st) return;
          const dx = e.clientX - st.x, dy = e.clientY - st.y;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.4) go(at + (dx < 0 ? 1 : -1));
        }}
      >
        {shots.map((sh, i) => (
          <img
            key={sh.key}
            src={sh.src}
            srcSet={sh.srcSet}
            sizes="(min-width: 768px) 40vw, 92vw"
            alt={i === at ? `${name}: ${sh.label}${sh.caption ? `. ${sh.caption}` : ""}` : ""}
            aria-hidden={i === at ? undefined : true}
            loading={i === 0 ? "eager" : "lazy"}
            fetchPriority={i === 0 ? "high" : undefined}
            decoding="async"
            draggable={false}
            data-pos={i < at ? "past" : i === at ? "here" : "ahead"}
            className="entry-shot"
          />
        ))}
        <p aria-hidden="true" className="num absolute left-2.5 top-2.5 bg-paper px-1.5 py-0.5 text-[12px] font-semibold text-paper-ink">
          {s.step(at + 1, n)}
        </p>
      </div>

      <div className="px-1 pb-1 pt-3 text-paper-ink sm:px-1.5">
        {/* The steps: each a place you can jump to. */}
        <div className="flex flex-wrap items-center gap-x-1 gap-y-1" role="group" aria-label={s.aria}>
          {shots.map((sh, i) => (
            <button
              key={sh.key}
              type="button"
              aria-current={i === at ? "step" : undefined}
              onClick={() => go(i)}
              className={`flex min-h-10 items-center gap-1.5 px-2 text-[14px] font-semibold transition-colors duration-150 ${i === at ? "text-paper-ink underline decoration-2 underline-offset-[6px]" : "text-paper-ink-3 hover:text-paper-ink"}`}
            >
              <span className="num text-[12px]">{i + 1}</span>
              {sh.label}
            </button>
          ))}
        </div>

        <p className="mt-1 min-h-10 px-2 text-[13px] text-paper-ink-2 sm:min-h-5" aria-live="polite">
          {[shot.caption, shot.demo ? s.illustration : null].filter(Boolean).join(" · ")}
        </p>

        {shot.hall && shot.zones.length ? (
          <div className="mt-3 px-2">
            <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-paper-ink-3">{s.where}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {shot.zones.map((z) => (
                <button key={z.z} type="button" onClick={() => toPlan(z.z)} className="group min-h-10 border border-paper-ink px-3 text-[14px] font-semibold text-paper-ink transition-colors duration-150 hover:bg-paper-ink hover:text-paper">
                  {z.label} <span className="ml-1 text-[13px] font-medium text-paper-ink-2 group-hover:text-paper">· {s.tables(z.n)}</span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-3 flex items-center justify-between gap-3 px-2 pb-1">
          {at > 0 ? (
            <button type="button" onClick={() => go(at - 1)} className="min-h-10 text-[14px] font-semibold text-paper-ink-2 hover:text-paper-ink">
              ← {s.back}
            </button>
          ) : (
            <span />
          )}
          {last ? (
            <button type="button" onClick={() => toPlan()} className="btn btn-ink btn-sm">
              {bookLabel}
            </button>
          ) : (
            <button type="button" onClick={() => go(at + 1)} className="btn btn-ink btn-sm">
              {nextLabel} →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
