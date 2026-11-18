import { NextResponse } from "next/server";
import { managerVenue } from "@/lib/backoffice";
import { readStored, servedByApp } from "@/lib/storage";

/** An invoice photo, for the manager of that venue only (the token in the path is the key). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; key: string[] }> }) {
  const { token, key } = await params;
  if (!servedByApp()) return new NextResponse("Not found", { status: 404 });
  const v = await managerVenue(token);
  if (!v) return new NextResponse("Unauthorized", { status: 401 });
  if (!key.length || key[0] !== v.id || key.some((p) => p === ".." || p === "." || p === "")) return new NextResponse("Not found", { status: 404 });
  const file = await readStored("invoices", key.join("/"));
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(file.body, { headers: { "content-type": file.type, "cache-control": "private, max-age=60", "referrer-policy": "no-referrer" } });
}
