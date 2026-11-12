/**
 * A printed plate: the picture inside a cream paper margin, square corners,
 * no shadow — a print mounted in a frame. It used to carry a caption line
 * with the venue's name; the name is set right under it as a heading, so
 * the caption only repeated it and was dropped (12 Nov 2026, «продумай
 * воронку ui чтобы все было органично»).
 * `aspect` is a class: catalog plates are square on phones (two places per
 * screen instead of one) and 4:5 from 640px.
 */
export function Plate({
  src,
  srcSet,
  sizes,
  bg,
  alt = "",
  aspect = "aspect-[4/5]",
  focus,
  priority = false,
}: {
  src: string;
  srcSet?: string;
  sizes?: string;
  bg: string;
  alt?: string;
  aspect?: string;
  /** object-position for crops, e.g. "50% 100%" keeps the bottom edge. */
  focus?: string;
  priority?: boolean;
}) {
  return (
    <figure className="bg-paper p-2 sm:p-2.5">
      <div className={`overflow-hidden ${aspect}`} style={{ background: bg }}>
        <img
          src={src}
          srcSet={srcSet}
          sizes={sizes}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          className="h-full w-full object-cover"
          style={focus ? { objectPosition: focus } : undefined}
        />
      </div>
    </figure>
  );
}
