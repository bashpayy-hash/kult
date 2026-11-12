import Link from "next/link";

/**
 * The Shaqyru mark: an S from two ribbons with a gap between them, lilac-blue
 * above and violet into coral below (design/icon-mark.svg). Drawn after the
 * owner's ribbon-icon reference, 12 Nov 2026.
 */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="136 96 240 320" width={size * (240 / 320)} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="shaqyru-top" x1="150" y1="0" x2="362" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b4cff" />
          <stop offset="1" stopColor="#7a4ff8" />
        </linearGradient>
        <linearGradient id="shaqyru-bottom" x1="150" y1="0" x2="362" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b54f6" />
          <stop offset="0.55" stopColor="#d0569f" />
          <stop offset="1" stopColor="#ff6a5c" />
        </linearGradient>
      </defs>
      <path
        transform="translate(-6 -9)"
        d="M362 112 L362 176 L262 176 Q226 176 226 204 Q226 226 256 238 L302 256 L210 256 L190 248 Q150 232 150 196 Q150 112 250 112 Z"
        fill="url(#shaqyru-top)"
      />
      <path
        transform="translate(6 9)"
        d="M150 400 L150 336 L250 336 Q286 336 286 308 Q286 286 256 274 L210 256 L302 256 L322 264 Q362 280 362 316 Q362 400 262 400 Z"
        fill="url(#shaqyru-bottom)"
      />
    </svg>
  );
}

/** Mark + lowercase wordmark, like the owner's «iitaly» logo. */
export function Logo({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 text-ink" aria-label="Shaqyru">
      <Mark size={24} />
      <span className="font-display text-[23px] font-bold leading-none tracking-[-0.04em]">shaqyru</span>
      {suffix ? <span className="label ml-1.5">{suffix}</span> : null}
    </Link>
  );
}
