/** A person's or a venue's first letter in a quiet circle: replaces the decorative orbs. */
export function Monogram({ name, size = 28, className = "" }: { name: string; size?: number; className?: string }) {
  const letter = (name.trim()[0] || "·").toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={`inline-grid shrink-0 place-items-center rounded-full border border-line bg-raised font-semibold text-ink-2 ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {letter}
    </span>
  );
}
