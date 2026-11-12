import "server-only";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { readStored, servedByApp } from "@/lib/storage";

// Serves uploads when the app stores them itself (Netlify Blobs or the local
// .uploads/ folder, see lib/storage.ts). Venue photos are public; story
// screenshots live under /admin/files, where the admin cookie (path=/admin)
// is sent — the app's version of signed URLs.
export async function serveLocal(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!servedByApp()) return new NextResponse("Not found", { status: 404 });
  const parts = (await params).path;
  const bucket = parts[0];
  if (bucket !== "venue-photos" && bucket !== "story-proofs") return new NextResponse("Not found", { status: 404 });
  if (bucket === "story-proofs" && !(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const rest = parts.slice(1);
  if (!rest.length || rest.some((p) => p === ".." || p === "." || p === "")) return new NextResponse("Bad path", { status: 400 });
  const file = await readStored(bucket, rest.join("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });
  // Keys carry a random UUID and are never reused, so a public photo can be
  // cached for good; private screenshots stay out of shared caches.
  const cache = bucket === "venue-photos" ? "public, max-age=31536000, immutable" : "private, max-age=60";
  return new NextResponse(file.body, { headers: { "content-type": file.type, "cache-control": cache } });
}
