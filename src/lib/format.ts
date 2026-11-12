import type { Lang } from "./i18n/dicts";

const TZ = "Asia/Almaty";

/** Today's calendar date in Almaty, 'YYYY-MM-DD'. */
export function almatyToday(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function shiftDate(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T00:00:00Z"));
}

const locale = (lang: Lang) => (lang === "kk" ? "kk-KZ" : "ru-RU");

/** '12 ноября' / '12 қараша'. */
export function formatDay(iso: string, lang: Lang = "ru", withWeekday = false): string {
  const d = new Date(iso + "T12:00:00Z");
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    ...(withWeekday ? { weekday: "long" } : {}),
  }).format(d);
}

export function formatDateTime(d: Date, lang: Lang = "ru"): string {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: TZ,
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 'HH:MM:SS' → 'HH:MM'. */
export function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** 45 000 ₸ */
export function formatMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₸";
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
}

/** Russian plural: plural(3, ['гость','гостя','гостей']). */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Kazakh / Russian phone → +7XXXXXXXXXX, or null if it does not look like one. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  let d = digits;
  if (d.length === 11 && (d.startsWith("8") || d.startsWith("7"))) d = d.slice(1);
  if (d.length !== 10) return digits.length >= 10 && digits.length <= 15 ? "+" + digits : null;
  return "+7" + d;
}

export function formatPhone(p: string | null): string {
  if (!p) return "—";
  const m = p.match(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/);
  return m ? `+7 ${m[1]} ${m[2]} ${m[3]} ${m[4]}` : p;
}

export function instagramHandle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/[/?#].*$/, "");
  return s ? s : null;
}
