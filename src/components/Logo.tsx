import Link from "next/link";

/**
 * The бөлек mark (12 Nov 2026, rebrand from Shaqyru: «у нас теперь все это
 * называется бөлек»). A disc cut in two by a straight gap: the gap is the
 * bar of «ө», the only letter of the name a Russian reader does not have,
 * and the two halves are the word itself — «бөлек», apart, separate. One
 * flat colour, like the printed marks of the annual reports the site follows.
 * Geometry: radius 120 on a 256 grid, gap 30 (an eighth of the diameter).
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 256 256" width={size} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path d="M8 113 A120 120 0 0 1 248 113 Z" />
      <path d="M8 143 A120 120 0 0 0 248 143 Z" />
    </svg>
  );
}

/** Mark + lowercase wordmark, like the owner's «iitaly» logo. */
export function Logo({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="logo inline-flex min-h-11 items-center gap-2 text-ink" aria-label="Бөлек">
      <Mark size={22} className="logo-mark" />
      <span className="text-[24px] font-bold leading-none tracking-[-0.045em]">бөлек</span>
      {suffix ? <span className="label ml-1.5">{suffix}</span> : null}
    </Link>
  );
}
