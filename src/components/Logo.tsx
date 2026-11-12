import Link from "next/link";

/** The Kult mark: a K from two ribbons, lilac-blue into coral (see design/icon-mark.svg). */
export function Mark({ size = 26, className }: { size?: number; className?: string }) {
  return (
    <svg viewBox="128 100 276 312" width={size * (276 / 312)} height={size} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="kult-stem" x1="136" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b4cff" />
          <stop offset="1" stopColor="#6a4dff" />
        </linearGradient>
        <linearGradient id="kult-arm" x1="214" y1="0" x2="396" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#8b54f6" />
          <stop offset="0.55" stopColor="#d0569f" />
          <stop offset="1" stopColor="#ff6a5c" />
        </linearGradient>
      </defs>
      <path d="M136 132 L206 108 L206 380 L136 404 Z" fill="url(#kult-stem)" />
      <path
        d="M396 108 L396 176 L298 246 Q284 256 298 266 L396 336 L396 404 L250 296 Q214 270 214 256 Q214 242 250 216 Z"
        fill="url(#kult-arm)"
      />
    </svg>
  );
}

export function Logo({ href = "/", suffix }: { href?: string; suffix?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2.5 text-ink" aria-label="Kult">
      <Mark size={24} />
      <span className="font-serif text-[26px] font-medium leading-none tracking-tight">Kult</span>
      {suffix ? <span className="ml-1 text-[13px] font-semibold text-ink-3">{suffix}</span> : null}
    </Link>
  );
}
