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
  const [booked, setBooked] = useState(false);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const el = document.getElementById("book");
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting && e.boundingClientRect.top > 0));
    io.observe(el);
    // After «Бронь принята» the bar would only invite a second booking (uxaudit, 15 Nov 2026).
    const done = () => setBooked(true);
    window.addEventListener("bolek:booked", done);
    // A form elsewhere on the page (e.g. «Посоветовать другу») must not sit under the bar.
    const focusIn = (e: FocusEvent) => setTyping(!!(e.target as Element | null)?.closest?.("[data-hide-bookbar]"));
    document.addEventListener("focusin", focusIn);
    return () => {
      io.disconnect();
      window.removeEventListener("bolek:booked", done);
      document.removeEventListener("focusin", focusIn);
    };
  }, []);
  if (booked) return null;
  const visible = show && !typing;
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-x-0 bottom-0 z-20 border-t border-line bg-canvas px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 ease-[var(--ease-out)] md:hidden ${visible ? "translate-y-0" : "translate-y-full"}`}
    >
      <a href="#book" tabIndex={visible ? undefined : -1} className="btn btn-primary w-full">
        {label}
      </a>
    </div>
  );
}
