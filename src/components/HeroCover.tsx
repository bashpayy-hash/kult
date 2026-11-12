"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The cover photograph, alive (DESIGN_PRINCIPLES §6 «Живые сцены»): the still
 * is on screen from the first paint and is the loop's own first frame, so
 * nothing switches when the video takes over. The video loads only after the
 * page's `load`, plays only while the cover is in view, and is skipped for
 * «less motion», Save-Data and 2G. It fades in over the still (opacity only).
 */
export function HeroCover({ src, srcSet, sizes, alt, loop, className, videoClassName }: { src: string; srcSet: string; sizes: string; alt: string; loop: string; className: string; videoClassName: string }) {
  const [want, setWant] = useState(false);
  const [playing, setPlaying] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || conn?.saveData || /2g/.test(conn?.effectiveType ?? "")) return;
    const go = () => setWant(true);
    if (document.readyState === "complete") go();
    else window.addEventListener("load", go, { once: true });
    return () => window.removeEventListener("load", go);
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!want || !v) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().catch(() => {});
      else v.pause();
    });
    io.observe(v);
    return () => io.disconnect();
  }, [want]);

  return (
    <>
      <img src={src} srcSet={srcSet} sizes={sizes} alt={alt} fetchPriority="high" className={className} />
      {want ? (
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
          className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ease-[var(--ease-out)] ${videoClassName} ${playing ? "opacity-100" : "opacity-0"}`}
        >
          {/* H.264 for Safari and most browsers; VP9 where H.264 is missing. */}
          <source src={loop} type="video/mp4" />
          <source src={loop.replace(/\.mp4$/, ".webm")} type="video/webm" />
        </video>
      ) : null}
    </>
  );
}
