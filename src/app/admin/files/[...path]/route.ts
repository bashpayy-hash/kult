import { serveLocal } from "@/lib/localFiles";

export function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return serveLocal(req, ctx);
}
