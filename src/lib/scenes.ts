import type { Category } from "./types";

/**
 * Category scenes generated in Higgsfield (design/illustrations/scenes-2026-11-12.json):
 * shown to guests until the venue uploads its own photo.
 */
const FILE: Record<Category, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  beauty: "beauty",
  wellness: "wellness",
  fitness: "fitness",
  other: "restaurant",
};

export function sceneFor(category: Category): { src: string; srcSet: string } {
  const f = FILE[category] ?? "restaurant";
  return {
    src: `/illustrations/scenes/${f}-1168.webp`,
    srcSet: `/illustrations/scenes/${f}-640.webp 640w, /illustrations/scenes/${f}-1168.webp 1168w`,
  };
}
