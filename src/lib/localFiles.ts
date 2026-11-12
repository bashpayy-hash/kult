import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { LOCAL_DIR, localFallback } from "@/lib/storage";

// Local-only stand-in for Supabase Storage (see lib/storage.ts). Venue photos
// are served here; story screenshots under /admin/files, where the admin
// cookie (path=/admin) is sent — the local version of signed URLs.
export async function serveLocal(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!localFallback()) return new NextResponse("Not found", { status: 404 });
  const parts = (await params).path;
  const bucket = parts[0];
  if (bucket !== "venue-photos" && bucket !== "story-proofs") return new NextResponse("Not found", { status: 404 });
  if (bucket === "story-proofs" && !(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const file = path.join(LOCAL_DIR, ...parts);
  if (!file.startsWith(LOCAL_DIR + path.sep) || parts.some((p) => p === "..")) return new NextResponse("Bad path", { status: 400 });
  try {
    const body = await readFile(file);
    const ext = path.extname(file).slice(1);
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new NextResponse(body, { headers: { "content-type": type, "cache-control": "private, max-age=60" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
