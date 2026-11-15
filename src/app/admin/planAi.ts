"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/auth";
import { aiAvailable, draftLocally, draftWithClaude, type Draft, type Plan, type Sketch } from "@/lib/planDraft";

export type DraftResult = { ok: true; draft: Draft } | { ok: false; error: string };

const SKETCH_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SKETCH_MAX = 3.5 * 1024 * 1024;

/**
 * The plan editor's assistant: a description and/or a photo of a sketch (plus
 * the plan on screen, for «сдвинь бар влево») in, a draft plan out. Admin only;
 * the draft is not stored.
 */
export async function draftPlan(fd: FormData): Promise<DraftResult> {
  await requireAdmin();
  const text = String(fd.get("text") || "").trim().slice(0, 2000);
  let current: Plan | null = null;
  try {
    const p = JSON.parse(String(fd.get("plan") || "null"));
    if (p && Array.isArray(p.halls) && Array.isArray(p.items)) current = p;
  } catch {
    current = null;
  }

  let sketch: Sketch | null = null;
  const file = fd.get("sketch");
  if (file instanceof File && file.size > 0) {
    if (!SKETCH_TYPES.has(file.type)) return { ok: false, error: "Набросок нужен картинкой JPG, PNG или WebP." };
    if (file.size > SKETCH_MAX) return { ok: false, error: "Фото наброска больше 3,5 МБ. Снимите в меньшем размере или сожмите." };
    sketch = { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type as Sketch["mediaType"] };
  }
  if (!text && !sketch) return { ok: false, error: "Опишите зал или приложите фото наброска." };

  if (aiAvailable()) {
    try {
      return { ok: true, draft: await draftWithClaude(text, current, sketch) };
    } catch (e) {
      // Most specific first: the parser below still gives the manager a draft.
      if (e instanceof Anthropic.RateLimitError) console.error("plan draft: rate limited");
      else if (e instanceof Anthropic.APIError) console.error("plan draft: API error", e.status, e.message);
      else console.error("plan draft failed", e);
      if (!text) return { ok: false, error: "ИИ сейчас не ответил, а без него набросок не прочитать. Опишите зал словами или попробуйте позже." };
      const d = draftLocally(text, current);
      return { ok: true, draft: { ...d, reply: `ИИ сейчас не ответил. ${d.reply}` } };
    }
  }
  if (!text) return { ok: false, error: "ИИ не подключён, а без него набросок не прочитать. Опишите зал словами." };
  return { ok: true, draft: draftLocally(text, current) };
}
