// Signed admin session cookie: "<expiresAt>.<hmac>". Web Crypto only, so the
// same code runs in proxy.ts and in server actions. The key mixes the session
// secret with the admin password: changing ADMIN_PASSWORD logs everyone out.
export const ADMIN_COOKIE = "kult_admin";

function secret(): string {
  const s = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? "" : "dev-only-session-secret");
  const p = process.env.ADMIN_PASSWORD || "";
  if (!s || !p) return "";
  return `${s}:${p}`;
}

async function hmac(data: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function signSession(maxAgeSeconds: number): Promise<string> {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD and SESSION_SECRET must be set.");
  const exp = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  return `${exp}.${await hmac(`admin:${exp}`, key)}`;
}

export async function verifySession(value: string | undefined): Promise<boolean> {
  const key = secret();
  if (!key || !value) return false;
  const [expStr, sig] = value.split(".");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp < Date.now() / 1000 || !sig) return false;
  const expected = await hmac(`admin:${exp}`, key);
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
