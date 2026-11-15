import type { Category } from "./types";

/**
 * Venue plates after the Annual Report DNA (design/dna/annual-reports.json):
 * cut-paper collages in the manner of Paul Rand's 1954 cover — real
 * photographed objects pasted on flat gouache. They stand for a category,
 * never for a particular venue; a venue's own photo always wins.
 * Manifest: design/illustrations/plates-2026-11-12.json. `bg` is sampled
 * from each image for the box behind it while it loads.
 * `focus` is the object-position used when a 4:5 plate is cut square on
 * phones: centred, except the bar, whose glass stands on the bottom edge
 * (checked on all six, 12 Nov 2026).
 */
const PLATES: Record<Category, { file: string; bg: string; focus?: string }> = {
  restaurant: { file: "restaurant", bg: "#7f91d7" },
  cafe: { file: "cafe", bg: "#cd831b" },
  bar: { file: "bar", bg: "#102041", focus: "50% 100%" },
  beauty: { file: "beauty", bg: "#879ad9" },
  wellness: { file: "wellness", bg: "#bd8f37" },
  fitness: { file: "fitness", bg: "#871310" },
  other: { file: "restaurant", bg: "#7f91d7" },
};

export type Cover = { src: string; srcSet: string; bg: string; focus?: string };

function plate(file: string, bg: string, focus?: string): Cover {
  return {
    src: `/plates/${file}-900.webp`,
    srcSet: `/plates/${file}-480.webp 480w, /plates/${file}-900.webp 900w`,
    bg,
    focus,
  };
}

export function coverFor(category: Category): Cover {
  const p = PLATES[category] ?? PLATES.other;
  return plate(p.file, p.bg, p.focus);
}

/**
 * The club: Chick, the mascot, holds up the invitation — the envelope whose
 * flap is a snowy peak, kept from the earlier club plate on the same red.
 * Chick is a modern Almaty girl (bob, oversized blazer, white tee) with one
 * Kazakh detail only, a single gold koshkar-muiz earring: 14 Nov 2026,
 * «должен быть только subtle намек, только один элемент… очень модерно».
 * Manifest: design/mascot/chick/chick-modern-2026-11-14.json.
 */
export const CLUB_COVER = plate("chick-club", "#e52e01");

/**
 * 404: Chick, a little lost at a trolleybus stop in 1970s Alma-Ata — the
 * red-and-cream trolleybus, a pale-blue Volga, Hotel Kazakhstan's golden
 * crown before the mountains, faded Soviet colour print. The girl stays
 * modern, the city is retro: 14 Nov 2026, «вот элементы такого ретро вайба
 * казахстана тоже нужно добавить».
 */
export const NOT_FOUND_COVER = plate("chick-404", "#7ca5ac");

/**
 * The cover since 15 Nov 2026: the site's own 3D Alma-Ata at golden hour, a
 * seamless loop in two cuts (CityFilm.tsx). It replaced the Heublein photograph (hero-*.webp, hero-loop.*) on 15 Nov 2026.
 */
export const FILM = {
  tall: { poster: "/plates/city-tall.webp", mp4: "/plates/city-tall.mp4" },
  wide: { poster: "/plates/city-wide.webp", mp4: "/plates/city-wide.mp4" },
  bg: "#c9a06a",
};

/** Coca-Cola 1987: one documentary photograph of a market. */
export const MARKET = {
  src: "/plates/market-1400.webp",
  srcSet: "/plates/market-800.webp 800w, /plates/market-1400.webp 1400w, /plates/market-2048.webp 2048w",
  bg: "#473c31",
};
