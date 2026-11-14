/**
 * A place's category as a small printed pictogram: one ink, one stroke
 * weight, drawn for 20×20. Used in the map's stamps, the list beside it and
 * the signs of the 3D walk (14 Nov 2026, owner on the square markers: «эти
 * прямоугольники некрасиво смотрятся… неужели нету других способов»).
 */
export type CategoryKind = "restaurant" | "cafe" | "bar" | "beauty" | "wellness" | "fitness" | "other";

export const MARK_PATHS: Record<CategoryKind, string> = {
  // Fork and knife.
  restaurant: "M6 3v6a2 2 0 0 0 4 0V3M8 3v14M14 3c-1.6 1-2 3-2 6h2v8",
  // A cup with steam.
  cafe: "M4 9h10v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM14 10h1.5a2 2 0 0 1 0 4H14M7 3c-1 1 1 2 0 4M11 3c-1 1 1 2 0 4",
  // A coupe glass.
  bar: "M3.5 5h13c0 4-3 6.5-6.5 6.5S3.5 9 3.5 5zM10 11.5V17M6.5 17h7",
  // A bottle of polish.
  beauty: "M8 3h4v4H8zM6.5 7h7v9.5a.5.5 0 0 1-.5.5H7a.5.5 0 0 1-.5-.5zM9 10v4",
  // A stack of stones with steam.
  wellness: "M5 16.5h10M6.5 16.5c0-1.6 1.6-2.5 3.5-2.5s3.5.9 3.5 2.5M8 14c0-1.2.9-2 2-2s2 .8 2 2M10 9c-.8-1 .8-2 0-3s.8-2 0-3",
  // A dumbbell.
  fitness: "M3 8v4M5.5 6.5v7M14.5 6.5v7M17 8v4M5.5 10h9",
  other: "M10 4l1.8 4 4.2.4-3.2 2.8 1 4.3L10 13.2 6.2 15.5l1-4.3L4 8.4 8.2 8z",
};

export function CategoryMark({ kind, className = "h-4 w-4" }: { kind: string; className?: string }) {
  const d = MARK_PATHS[(kind as CategoryKind) in MARK_PATHS ? (kind as CategoryKind) : "other"];
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}
