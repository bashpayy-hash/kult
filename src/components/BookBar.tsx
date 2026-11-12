"use client";

import { useEffect, useState } from "react";

/**
 * Phones only. On a venue page the booking form starts below the photo,
 * the facts and the perk, a screen or more down. Until the form is on
 * screen, this bar keeps the one next step in reach; once the form is
 * reached (or passed), it slides away. Funnel, 12 Nov 2026: «продумай
 * воронку ui чтобы все было органично».
 */
export function BookBar({ label }: { label: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = document.getElementById("book");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      aria-hidden={!show}
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 ease-[var(--ease-out)] md:hidden ${show ? "translate-y-0" : "translate-y-full"}`}
    >
      <a href="#book" tabIndex={show ? undefined : -1} className="btn btn-primary w-full">
        {label}
      </a>
    </div>
  );
}
