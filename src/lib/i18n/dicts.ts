// Plain module (no server-only) so client components can pick a dictionary by
// `lang`: dictionaries hold functions, which cannot cross the server→client
// boundary as props.
import ru, { type Dict } from "./ru";
import kk from "./kk";

export type Lang = "ru" | "kk";
export const dicts: Record<Lang, Dict> = { ru, kk };
export type { Dict };
