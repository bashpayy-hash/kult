"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The home page's cover (15 Nov 2026, owner: «иллюстрация классная, но не под
 * лендинг… нужно брать ещё что-то сильнее»): the site's own 3D Alma-Ata at
 * golden hour — over the city towards the range, Arbat under its festoons,
 * Dostyk towards the mountains — as a seamless loop (scripts/render-hero-film.mjs,
 * scripts/encode-hero-film.py). Tall cut for phones, wide for computers.
 *
 * The still is on screen from the first paint and is the loop's own first
 * frame. The video loads only after the page's `load`, plays only while in
 * view, and is skipped for «less motion», Save-Data and 2G.
 */
export type FilmCut = { poster: string; mp4: string };

export function CityFilm({ tall, wide, alt }: { tall: FilmCut; wide: FilmCut; alt: string }) {
  const [cut, setCut] = useState<FilmCut | null>(null);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
    const go = () => setCut(matchMedia("(min-width: 768px)").matches ? wide : tall);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, [tall, wide]);

  useEffect(() => {
    const v = video.current;
    if (!cut || !v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [cut]);

  return (
    <>
      <picture>
        <source media="(min-width: 768px)" srcSet={wide.poster} />
        <img src={tall.poster} alt={alt} fetchPriority="high" className="absolute inset-0 h-full w-full object-cover" />
      </picture>
      {cut ? (
        <video
          ref={video}
          muted
          loop
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          aria-hidden="true"
          tabIndex={-1}
          onPlaying={() => setPlaying(true)}
          className={`pointer-events-none absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-[var(--ease-out)] ${playing ? "opacity-100" : "opacity-0"}`}
        >
          <source src={cut.mp4} type="video/mp4" />
        </video>
      ) : null}
    </>
  );
}

/** «Войти в город» from the cover: opens the same walk the map opens (CityMap listens). */
export function WalkButton({ label, className }: { label: string; className?: string }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event("bolek:walk"))} className={className}>
      <svg viewBox="0 0 16 20" className="h-4 w-4" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="2.8" r="1.6" fill="currentColor" stroke="none" />
        <path d="M8 6.5l-2.5 3.5 2 2.5-1.5 6M8 6.5l1.5 4 3 1M7.5 12.5l3 2 1 4" />
      </svg>
      {label}
    </button>
  );
}
