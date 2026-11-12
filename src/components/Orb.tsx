export const ORB_TONES = ["iris", "coral", "aqua", "sage", "violet", "pearl"] as const;
export type OrbTone = (typeof ORB_TONES)[number];

/** Stable tone for a person or place, so the same member always has the same orb. */
export function toneFor(key: string): OrbTone {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return ORB_TONES[h % 5]; // pearl is kept for neutral states
}

export function Orb({
  tone = "iris",
  size = 56,
  still = false,
  className = "",
}: {
  tone?: OrbTone;
  size?: number | string;
  still?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`orb orb-${tone} ${className}`}
      style={typeof size === "number" ? { width: size, height: size } : { width: size, aspectRatio: "1" }}
      data-still={still ? "" : undefined}
    />
  );
}
