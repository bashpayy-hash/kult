import type { Category } from "./types";

/**
 * Category covers in the manner of 1950s annual reports (owner, 12 Nov 2026:
 * «вот такие вот рето стилистики мне очень нравятся»): flat cut-paper
 * shapes, one witty metaphor each, one ground colour each. They stand for a
 * category, not for a venue, so they never pretend to be a venue's photo.
 * Manifest: design/illustrations/covers-2026-11-12.json. `bg` is sampled from
 * the image so the box behind it matches while it loads.
 */
const COVERS: Record<Category, { file: string; bg: string }> = {
  restaurant: { file: "restaurant", bg: "#ce301f" },
  cafe: { file: "cafe", bg: "#e39417" },
  bar: { file: "bar", bg: "#1a1511" },
  beauty: { file: "beauty", bg: "#dd7459" },
  wellness: { file: "wellness", bg: "#72702e" },
  fitness: { file: "fitness", bg: "#d8521b" },
  other: { file: "restaurant", bg: "#ce301f" },
};

export type Cover = { src: string; srcSet: string; bg: string };

function cover(file: string, bg: string): Cover {
  return {
    src: `/covers/${file}-1024.webp`,
    srcSet: `/covers/${file}-640.webp 640w, /covers/${file}-1024.webp 1024w`,
    bg,
  };
}

export function coverFor(category: Category): Cover {
  const c = COVERS[category] ?? COVERS.other;
  return cover(c.file, c.bg);
}

/** The club: an envelope whose flap is a mountain peak (шақыру — invitation). */
export const CLUB_COVER = cover("club", "#ce311e");
