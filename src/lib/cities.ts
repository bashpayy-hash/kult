/**
 * The cities on the map (12 Nov 2026, owner: «добавить карту Алматы и Астаны
 * по местам ... покажет скейл проекта»).
 *
 * Each city has a fixed frame in degrees. The plan in public/maps/<key>.svg
 * is drawn by scripts/build-city-maps.mjs from OpenStreetMap data inside
 * exactly this frame, in an equirectangular projection, so a point's place
 * on it is linear: left = (lng − west) / (east − west), top = (north − lat) /
 * (north − south). Change a frame here and re-run the script together.
 *
 * Venues keep their city as text (venues.city, «Алматы» by default since the
 * first migration); cityKey() maps that text to a key.
 */
export type CityKey = "almaty" | "astana";

export type City = {
  key: CityKey;
  name: { ru: string; kk: string };
  /** 2GIS city slug, for «Маршрут в 2ГИС» links. */
  gis: string;
  frame: { south: number; west: number; north: number; east: number };
  /** The city's own point, for the country inset. */
  centre: { lat: number; lng: number };
};

export const CITIES: City[] = [
  {
    key: "almaty",
    name: { ru: "Алматы", kk: "Алматы" },
    gis: "almaty",
    // Centre of the city between Raiymbek Ave and the foothills, Saina St
    // and Medeu Rd: about 11 × 13 km. Since 14 Nov 2026 it reaches 2 km
    // further south, so the detailed plan (public/maps/almaty/, drawn by
    // scripts/draw-almaty-plan.py) shows the foothills rising.
    frame: { south: 43.17, west: 76.86, north: 43.29, east: 77.0 },
    centre: { lat: 43.2389, lng: 76.8897 },
  },
  {
    key: "astana",
    name: { ru: "Астана", kk: "Астана" },
    gis: "astana",
    // Both banks of the Esil, from the old town to Expo: about 13 × 13 km.
    frame: { south: 51.08, west: 71.33, north: 51.2, east: 71.52 },
    centre: { lat: 51.1694, lng: 71.4491 },
  },
];

export function cityByKey(key: CityKey): City {
  return CITIES.find((c) => c.key === key)!;
}

/** «Алматы», «Almaty», «алматы » → almaty; anything unknown → null. */
export function cityKey(text: string | null | undefined): CityKey | null {
  const t = (text ?? "").trim().toLowerCase();
  if (/^(алматы|almaty|alma-ata|алма-ата)$/.test(t)) return "almaty";
  if (/^(астана|astana|нур-султан|nur-sultan)$/.test(t)) return "astana";
  return null;
}

/** Where a point sits on the city's plan, in percent; null when outside it. */
export function placeOnPlan(city: City, lat: number, lng: number): { left: number; top: number } | null {
  const f = city.frame;
  if (lat < f.south || lat > f.north || lng < f.west || lng > f.east) return null;
  return { left: ((lng - f.west) / (f.east - f.west)) * 100, top: ((f.north - lat) / (f.north - f.south)) * 100 };
}

/** Width of the plan in kilometres (for the scale bar). */
export function planWidthKm(city: City): number {
  const f = city.frame;
  const midLat = ((f.north + f.south) / 2) * (Math.PI / 180);
  return (f.east - f.west) * 111.32 * Math.cos(midLat);
}

/** Aspect ratio (width / height) of the plan, the same one the SVG is drawn in. */
export function planAspect(city: City): number {
  const f = city.frame;
  const midLat = ((f.north + f.south) / 2) * (Math.PI / 180);
  return ((f.east - f.west) * Math.cos(midLat)) / (f.north - f.south);
}

/** 2GIS opens at the point, zoomed to street level. */
export function gisLink(city: City, lat: number, lng: number): string {
  return `https://2gis.kz/${city.gis}?m=${lng.toFixed(6)}%2C${lat.toFixed(6)}%2F17`;
}

/** Height of the plan in kilometres. */
export function planHeightKm(city: City): number {
  return (city.frame.north - city.frame.south) * 111.32;
}

/**
 * public/maps/kazakhstan.svg is drawn in this frame (same projection as the
 * city plans), from geoBoundaries (CC BY 4.0) via scripts/build-city-maps.mjs.
 */
export const COUNTRY = {
  frame: { south: 40.5, west: 46.4, north: 55.5, east: 87.4 },
  aspect: 1000 / 546.8,
};

export function placeOnCountry(lat: number, lng: number): { left: number; top: number } {
  const f = COUNTRY.frame;
  return { left: ((lng - f.west) / (f.east - f.west)) * 100, top: ((f.north - lat) / (f.north - f.south)) * 100 };
}

/** Without a point, 2GIS searches the address in the city. */
export function gisSearch(city: City, address: string): string {
  return `https://2gis.kz/${city.gis}/search/${encodeURIComponent(address)}`;
}
