import Link from "next/link";

/**
 * The Shaqyru mark: an S from two ribbons with a gap between them
 * (design/icon-mark.svg). One flat colour since 12 Nov 2026 — the
 * blue-violet-coral gradient read as generated («слишком ии слопно»).
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="136 96 240 320" width={size * (240 / 320)} height={size} className={className} aria-hidden="true" fill="currentColor">
      <path
        transform="translate(-6 -9)"
        d="M362 112 L362 176 L262 176 Q226 176 226 204 Q226 226 256 238 L302 256 L210 256 L190 248 Q150 232 150 196 Q150 112 250 112 Z"
      />
      <path
        transform="translate(6 9)"
        d="M150 400 L150 336 L250 336 Q286 336 286 308 Q286 286 256 274 L210 256 L302 256 L322 264 Q362 280 362 316 Q362 400 262 400 Z"
      />
    </svg>
  );
}

/** Mark + lowercase wordmark, like the owner's «iitaly» logo. */
export function Logo({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="inline-flex min-h-11 items-center gap-2 text-ink" aria-label="Shaqyru">
      <Mark size={24} />
      <span className="font-display text-[23px] font-bold leading-none tracking-[-0.04em]">shaqyru</span>
      {suffix ? <span className="label ml-1.5">{suffix}</span> : null}
    </Link>
  );
}
