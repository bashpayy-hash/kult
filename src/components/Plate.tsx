import type { ReactNode } from "react";

/**
 * A printed plate: the picture inside a cream paper margin with a caption
 * line set small along its bottom edge — the way the covers set «Consolidated
 * Cigar Corporation · Annual Report 1954». Square corners, no shadow.
 */
export function Plate({
  src,
  srcSet,
  sizes,
  bg,
  alt = "",
  left,
  right,
  ratio = "4/5",
  priority = false,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  bg: string;
  alt?: string;
  left?: ReactNode;
  right?: ReactNode;
  ratio?: string;
  priority?: boolean;
}) {
  return (
    <figure className="bg-paper p-2 text-paper-ink sm:p-2.5">
      <div className="overflow-hidden" style={{ aspectRatio: ratio, background: bg }}>
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="h-full w-full object-cover"
        />
      </div>
      {left || right ? (
        <figcaption className="flex items-baseline justify-between gap-3 px-0.5 pb-0.5 pt-2.5 text-[14px] leading-tight">
          <span className="min-w-0 truncate font-semibold">{left}</span>
          {right ? <span className="shrink-0 text-paper-ink-3">{right}</span> : null}
        </figcaption>
      ) : null}
    </figure>
  );
}
