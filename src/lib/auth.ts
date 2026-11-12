import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, signSession, verifySession } from "./session";

const MAX_AGE = 60 * 60 * 24 * 14; // 14 days

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verifySession(jar.get(ADMIN_COOKIE)?.value);
}

/**
 * Every admin server action calls this first. The proxy only guards page
 * requests to /admin; a server action can be POSTed to any path, so the check
 * has to live inside the action too.
 */
export async function requireAdmin(): Promise<void> {
  if (!(await isAdmin())) redirect("/admin/login");
}

export async function startAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await signSession(MAX_AGE), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession(): Promise<void> {
  const jar = await cookies();
  jar.set(ADMIN_COOKIE, "", { path: "/admin", maxAge: 0 });
}

/** Constant-time password check against ADMIN_PASSWORD. */
export async function checkAdminPassword(input: string): Promise<boolean> {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(input)),
    crypto.subtle.digest("SHA-256", enc.encode(expected)),
  ]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
