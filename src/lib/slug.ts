// Latin slugs for /<member>/<venue>, from Russian or Kazakh names.
const MAP: Record<string, string> = {
  а: "a", ә: "a", б: "b", в: "v", г: "g", ғ: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
  и: "i", й: "y", і: "i", к: "k", қ: "k", л: "l", м: "m", н: "n", ң: "n", о: "o", ө: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ұ: "u", ү: "u", ф: "f", х: "h", һ: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export const RESERVED_SLUGS = new Set([
  "admin", "h", "api", "privacy", "_next", "static", "public", "favicon.ico", "robots.txt",
  "icon", "apple-icon", "login", "uploads",
]);

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .split("")
    .map((ch) => MAP[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s.length >= 2 ? s : "";
}

export function isValidSlug(s: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,39}$/.test(s) && !RESERVED_SLUGS.has(s);
}
