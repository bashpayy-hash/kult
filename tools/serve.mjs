// Static server for a build folder (Next.js `out/`, Vite `dist/`…), so the
// audit sees exactly what the host will serve.
// Usage: node tools/serve.mjs out 4310
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
const root = process.argv[2] || "out", port = Number(process.argv[3] || 4310);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".avif": "image/avif", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".txt": "text/plain", ".mp4": "video/mp4", ".webm": "video/webm", ".woff2": "font/woff2", ".ico": "image/x-icon", ".xml": "application/xml" };
async function find(p) {
  for (const c of [p, p + ".html", join(p, "index.html")]) { try { if ((await stat(c)).isFile()) return c; } catch {} }
}
createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = await find(join(root, url));
  if (!file) { res.writeHead(404, { "content-type": "text/html" }); res.end(await readFile(join(root, "404.html")).catch(() => "404")); return; }
  res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
  res.end(await readFile(file));
}).listen(port, () => console.log(`serving ${root} on http://localhost:${port}`));
