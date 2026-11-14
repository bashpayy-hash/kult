/**
 * A time set like a departure board: each figure slides up out of its own
 * slot, one after another (.tick in globals.css). `delay` starts the board
 * after the row it sits in has come in. Screen readers get the plain text.
 */
export function Tick({ text, delay = 0, className = "" }: { text: string; delay?: number; className?: string }) {
  return (
    <span className={`tick ${className}`} style={{ ["--t0" as string]: `${delay}ms` }}>
      {/* The time in plain text for screen readers (aria-label is not allowed on a plain span). */}
      <span className="sr-only">{text}</span>
      {[...text].map((ch, i) => (
        <span key={i} aria-hidden="true" style={{ ["--d" as string]: i }}>
          {ch}
        </span>
      ))}
    </span>
  );
}
