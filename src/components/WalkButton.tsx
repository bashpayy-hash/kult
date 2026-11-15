"use client";

/** «Прогуляться по центру» from the cover: opens the same walk the map opens (CityMap listens). */
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
