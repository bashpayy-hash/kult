import "server-only";
import { cookies, headers } from "next/headers";
import { dicts, type Dict, type Lang } from "./dicts";

export type { Dict, Lang };
export const LANG_COOKIE = "lang";

export function isLang(x: unknown): x is Lang {
  return x === "ru" || x === "kk";
}

/** Cookie first; otherwise Kazakh only when the browser asks for it first. */
export async function getLang(): Promise<Lang> {
  const jar = await cookies();
  const c = jar.get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  const al = (await headers()).get("accept-language") || "";
  return /^\s*kk/i.test(al) ? "kk" : "ru";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: dicts[lang] };
}
