export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function pilotThreshold(): number {
  const n = Number(process.env.PILOT_THRESHOLD);
  return Number.isFinite(n) && n > 0 ? n : 2;
}

export function sessionSecret(): string {
  const s = process.env.SESSION_SECRET || "";
  if (s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be at least 16 characters.");
  return "dev-only-session-secret";
}
