import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
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

// Without Supabase credentials, in development (or with STORAGE_LOCAL=1 for a
// local `next start`), files go to .uploads/ and are served by
// src/app/uploads/[...path]/route.ts. A real deployment always needs Supabase.
export function localFallback(): boolean {
  return !supabase() && (process.env.NODE_ENV !== "production" || process.env.STORAGE_LOCAL === "1");
}
export const LOCAL_DIR = path.join(process.cwd(), ".uploads");

export class UploadError extends Error {}

export async function uploadImage(bucket: Bucket, prefix: string, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) throw new UploadError("Нужна картинка JPG, PNG или WebP.");
  if (file.size > MAX_BYTES) throw new UploadError("Файл больше 5 МБ.");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const key = `${prefix}/${randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  if (localFallback()) {
    const target = path.join(LOCAL_DIR, bucket, key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes);
    return key;
  }
  const sb = supabase();
  if (!sb) throw new UploadError("Хранилище не настроено: нужны SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.");
  const { error } = await sb.storage.from(bucket).upload(key, bytes, { contentType: file.type, upsert: false });
  if (error) throw new UploadError(`Не удалось загрузить файл: ${error.message}`);
  return key;
}

export async function removeImage(bucket: Bucket, key: string | null): Promise<void> {
  if (!key) return;
  if (localFallback()) {
    await unlink(path.join(LOCAL_DIR, bucket, key)).catch(() => {});
    return;
  }
  await supabase()?.storage.from(bucket).remove([key]);
}

export function publicImageUrl(key: string | null): string | null {
  if (!key) return null;
  if (localFallback()) return `/uploads/venue-photos/${key}`;
  const base = process.env.SUPABASE_URL?.replace(/\/+$/, "");
  return base ? `${base}/storage/v1/object/public/venue-photos/${key}` : null;
}

/** Story screenshots are private: signed URLs valid for an hour. */
export async function signedImageUrls(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const list = keys.filter(Boolean);
  if (!list.length) return out;
  if (localFallback()) {
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
