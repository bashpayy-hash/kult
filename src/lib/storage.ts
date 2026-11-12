import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

export type Bucket = "venue-photos" | "story-proofs";

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 5 * 1024 * 1024;

let client: SupabaseClient | null | undefined;
function supabase(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return client;
}

/**
 * Where uploads live:
 * - supabase: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set (Supabase Storage);
 * - blobs:    STORAGE_BACKEND=blobs on Netlify (Netlify Blobs, store "uploads");
 * - local:    development, or STORAGE_LOCAL=1 for a local `next start` (.uploads/);
 * - none:     a production build with none of the above — uploads are refused.
 * In blobs and local mode the app serves the files itself: venue photos at
 * /uploads/venue-photos/…, story screenshots at /admin/files/story-proofs/…
 * behind the admin cookie (path=/admin), the stand-in for signed URLs.
 */
type Mode = "supabase" | "blobs" | "local" | "none";
function mode(): Mode {
  if (supabase()) return "supabase";
  if (process.env.STORAGE_BACKEND === "blobs") return "blobs";
  if (process.env.NODE_ENV !== "production" || process.env.STORAGE_LOCAL === "1") return "local";
  return "none";
}
export function servedByApp(): boolean {
  const m = mode();
  return m === "blobs" || m === "local";
}

const LOCAL_DIR = path.join(process.cwd(), ".uploads");
// One site-wide store; keys are "<bucket>/<prefix>/<uuid>.<ext>", never reused.
const blobs = () => getStore({ name: "uploads", consistency: "strong" });

export class UploadError extends Error {}

export async function uploadImage(bucket: Bucket, prefix: string, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new UploadError("Нужна картинка JPG, PNG или WebP.");
  if (file.size > MAX_BYTES) throw new UploadError("Файл больше 5 МБ.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `${prefix}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  switch (mode()) {
    case "blobs":
      await blobs().set(`${bucket}/${key}`, new Blob([bytes], { type: file.type }), { metadata: { type: file.type } });
      return key;
    case "local": {
      const target = path.join(LOCAL_DIR, bucket, key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      return key;
    }
    case "supabase": {
      const { error } = await supabase()!.storage.from(bucket).upload(key, bytes, { contentType: file.type, upsert: false });
      if (error) throw new UploadError(`Не удалось загрузить файл: ${error.message}`);
      return key;
    }
    default:
      throw new UploadError("Хранилище не настроено: нужен STORAGE_BACKEND=blobs на Netlify или SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  }
}

export async function removeImage(bucket: Bucket, key: string | null): Promise<void> {
  if (!key) return;
  switch (mode()) {
    case "blobs":
      await blobs().delete(`${bucket}/${key}`).catch(() => {});
      return;
    case "local":
      await unlink(path.join(LOCAL_DIR, bucket, key)).catch(() => {});
      return;
    case "supabase":
      await supabase()!.storage.from(bucket).remove([key]);
      return;
  }
}

/** Bytes and type of a stored file, for the app's own file routes; null if missing. */
export async function readStored(bucket: Bucket, key: string): Promise<{ body: ArrayBuffer; type: string } | null> {
  const ext = path.extname(key).slice(1);
  const typeOf = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  if (mode() === "blobs") {
    const body = await blobs().get(`${bucket}/${key}`, { type: "arrayBuffer" });
    return body ? { body, type: typeOf } : null;
  }
  if (mode() === "local") {
    const file = path.join(LOCAL_DIR, bucket, key);
    if (!file.startsWith(LOCAL_DIR + path.sep)) return null;
    try {
      const buf = await readFile(file);
      return { body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, type: typeOf };
    } catch {
      return null;
    }
  }
  return null;
}

export function publicImageUrl(key: string | null): string | null {
  if (!key) return null;
  if (servedByApp()) return `/uploads/venue-photos/${key}`;
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/public/venue-photos/${key}` : null;
}

/** Story screenshots are private: signed URLs valid for an hour. */
export async function signedImageUrls(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = keys.filter(Boolean);
  if (!list.length) return out;
  if (servedByApp()) {
    for (const k of list) out[k] = `/admin/files/story-proofs/${k}`;
    return out;
  }
  const sb = supabase();
  if (!sb) return out;
  const { data } = await sb.storage.from("story-proofs").createSignedUrls(list, 3600);
  for (const row of data || []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

export function fileFrom(form: FormData, name: string): File | null {
  const f = form.get(name);
  return f instanceof File && f.size > 0 ? f : null;
}
