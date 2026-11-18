import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { Sketch } from "./planDraft";

// Claude reads a supplier's invoice, or counts goods on a shelf, from a phone
// photo (18 Nov 2026, the back office). As with the plan assistant, the
// Netlify AI Gateway supplies the key; without it the manager types the lines.
// The result is only a draft: the manager checks it before anything is saved.

export type InvoiceDraft = {
  supplier: string;
  number: string;
  date: string;
  total: number | null;
  lines: { name: string; qty: number | null; unit: string; price: number | null; sum: number | null }[];
  note: string;
};
export type ShelfCount = { items: { name: string; count: number; unit: string; sure: boolean }[]; note: string };

const MODEL = () => process.env.PLAN_AI_MODEL || "claude-opus-5-5";
const NUM_OR_NULL = { anyOf: [{ type: "number" }, { type: "null" }] };

const INVOICE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "number", "date", "total", "lines", "note"],
  properties: {
    supplier: { type: "string", description: "The supplier's name as printed, or an empty string." },
    number: { type: "string", description: "The invoice number, or an empty string." },
    date: { type: "string", description: "The invoice date as YYYY-MM-DD, or an empty string." },
    total: { ...NUM_OR_NULL, description: "The invoice total in tenge as printed." },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "qty", "unit", "price", "sum"],
        properties: {
          name: { type: "string", description: "The goods, in Russian as printed, without the unit." },
          qty: NUM_OR_NULL,
          unit: { type: "string", description: "кг, л, шт, уп, пучок… or an empty string." },
          price: { ...NUM_OR_NULL, description: "Price per unit in tenge." },
          sum: { ...NUM_OR_NULL, description: "The line's sum in tenge as printed." },
        },
      },
    },
    note: { type: "string", description: "One short sentence in Russian: anything unreadable or doubtful, else an empty string." },
  },
} as const;

const SHELF_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "note"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "count", "unit", "sure"],
        properties: {
          name: { type: "string", description: "The item, using the venue's own name from the list when it matches." },
          count: { type: "number" },
          unit: { type: "string" },
          sure: { type: "boolean", description: "False when the count is a guess (hidden rows, unclear packs)." },
        },
      },
    },
    note: { type: "string", description: "One short sentence in Russian on what could not be counted, else an empty string." },
  },
} as const;

async function ask<T>(system: string, text: string, image: Sketch, schema: object): Promise<T> {
  const client = new Anthropic({ maxRetries: 1, timeout: 55_000 });
  // Streamed, low effort: inside the 60-second limit of a Netlify function.
  const stream = client.messages.stream({
    model: MODEL(),
    max_tokens: 16000,
    system,
    output_config: { effort: "low", format: { type: "json_schema", schema: schema as Record<string, unknown> } },
    messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text }] }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  if (msg.stop_reason === "max_tokens") throw new Error("max_tokens");
  const block = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!block) throw new Error("no text");
  return JSON.parse(block.text) as T;
}

export async function readInvoicePhoto(image: Sketch): Promise<InvoiceDraft> {
  const r = await ask<InvoiceDraft>(
    `You read supplier invoices (накладные, счета-фактуры) for a restaurant in Kazakhstan from phone photos. Copy what is printed or handwritten; never invent a line or a number. Amounts are in tenge: drop spaces between thousands, use a point for decimals. If the photo is not an invoice, return no lines and say so in note.`,
    "Прочитай накладную.",
    image,
    INVOICE_SCHEMA,
  );
  return {
    supplier: String(r.supplier || "").slice(0, 80),
    number: String(r.number || "").slice(0, 40),
    date: /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : "",
    total: typeof r.total === "number" && Number.isFinite(r.total) ? r.total : null,
    lines: (r.lines || []).slice(0, 80).map((l) => ({
      name: String(l.name || "").slice(0, 120),
      qty: typeof l.qty === "number" ? l.qty : null,
      unit: String(l.unit || "").slice(0, 12),
      price: typeof l.price === "number" ? l.price : null,
      sum: typeof l.sum === "number" ? l.sum : null,
    })).filter((l) => l.name),
    note: String(r.note || "").slice(0, 300),
  };
}

export async function countShelfPhoto(image: Sketch, known: { name: string; unit: string | null }[]): Promise<ShelfCount> {
  const list = known.length ? `Позиции заведения: ${known.map((k) => `${k.name}${k.unit ? ` (${k.unit})` : ""}`).join("; ")}.` : "";
  const r = await ask<ShelfCount>(
    `You count stock on a restaurant's shelf, fridge or storeroom from a phone photo, for an inventory. Count only what you can see; mark a count unsure when packs hide each other. Use the venue's own item names when they match.`,
    `Посчитай, что на фото. ${list}`,
    image,
    SHELF_SCHEMA,
  );
  return {
    items: (r.items || []).slice(0, 60).map((i) => ({ name: String(i.name || "").slice(0, 120), count: Number(i.count) || 0, unit: String(i.unit || "").slice(0, 12), sure: !!i.sure })).filter((i) => i.name),
    note: String(r.note || "").slice(0, 300),
  };
}
