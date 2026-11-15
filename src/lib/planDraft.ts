import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { randomUUID } from "node:crypto";
import { isZone, ZONES, type PlanHall, type PlanItem, type Zone } from "./booking";

// A draft floor plan from a manager's words or a photo of a sketch (15 Nov
// 2026, owner: «Ресторан спросит, что конкретно кидать… планировку примерно
// опишет. Или мы поможем ему сделать планировку… Чат ИИ, который будет
// помогать сделать планировку»).
//
// Claude reads the description (and the sketch, if any) and returns the whole
// plan; on Netlify the AI Gateway supplies ANTHROPIC_API_KEY and
// ANTHROPIC_BASE_URL, so no key lives in the project. Without them, or if the
// call fails, a small parser below turns plain sentences («4 стола на двоих у
// окна, бар на 6») into a plan. Either way the result is only a draft: it
// lands in the editor, and nothing is stored until «Сохранить план».

export type Plan = { halls: PlanHall[]; items: PlanItem[] };
export type Draft = Plan & { reply: string; source: "ai" | "local" };
export type Sketch = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

const MAX_HALLS = 10;
const MAX_ITEMS = 120;

// ── Claude ───────────────────────────────────────────────────────────────

const ZONE_OR_NONE = [...ZONES, "none"];

// Structured output: every field required, no extra keys; numbers are checked
// and clamped by tidy() afterwards.
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "halls", "items"],
  properties: {
    reply: { type: "string", description: "One or two short sentences in Russian for the manager: what was drawn, what was assumed, what to clarify." },
    halls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "name_kk", "width", "height"],
        properties: {
          id: { type: "string", description: "The hall's id from the current plan when keeping that hall, otherwise a short new key such as \"h2\"." },
          name: { type: "string" },
          name_kk: { type: "string", description: "The name in Kazakh, or an empty string." },
          width: { type: "integer" },
          height: { type: "integer" },
        },
      },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "hall_id", "kind", "label", "shape", "x", "y", "w", "h", "seats_min", "seats_max", "zone"],
        properties: {
          id: { type: "string", description: "The item's id from the current plan when it is kept or moved, otherwise an empty string." },
          hall_id: { type: "string", description: "The id or key of the hall it stands in." },
          kind: { type: "string", enum: ["table", "decor"] },
          label: { type: "string" },
          shape: { type: "string", enum: ["rect", "round"] },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
          seats_min: { type: "integer" },
          seats_max: { type: "integer" },
          zone: { type: "string", enum: ZONE_OR_NONE },
        },
      },
    },
  },
} as const;

const SYSTEM = `You draw restaurant, café and bar floor plans for a table-booking site in Almaty. A venue's manager describes a hall in Russian or Kazakh, sometimes with a photo of a hand-drawn sketch, and sometimes asks to change the plan they already have. Guests will see the plan and pick a table, so it should be a faithful, tidy map of the room rather than a precise architectural drawing.

Coordinates: one unit is about 10 cm; origin at the hall's top-left corner, x to the right, y down. A 12 × 8 m hall is 120 × 80. Halls are 20–400 units on each side. Every item lies fully inside its hall, items do not overlap, and tables keep at least 3 units of aisle between each other.

Sizes include the chairs around a table: for 2 guests a round table 10 × 10; for 4 a rectangle 18 × 12; for 6, 24 × 12; for 8, 30 × 14; larger tables grow in length. seats_min is the smallest party the venue seats at that table (usually 1 for two-seaters, 2 for four-seaters, about half for big tables); seats_max is its capacity.

Tables are kind "table", labelled with numbers "1", "2", … continuing across halls, unless the manager names them. Things guests should see but cannot book are kind "decor" with a short Russian label: «Бар», «Вход», «Окна», «Кухня», «Сцена», «Гардероб», «Диван». Windows are a thin strip (3 units) along the wall they are on. Seats at a bar counter are one table labelled «Бар» next to the counter, with seats_max equal to the number of stools.

zone says where a table stands, for guests who ask for a place: "window" next to windows, "bar" next to the bar counter, "kitchen" next to an open kitchen, "terrace" on a terrace or summer veranda, "sofa" on sofas or soft seating, "private" in a separate room or cabin, "quiet" in a corner the manager calls quiet; otherwise "none".

With a sketch, follow its layout: walls, where windows, bar and entrance are, how many tables and where. Read numbers written on it. Without a sketch, place things sensibly: windows along the wall the manager names (the right wall if unsaid), the bar along the top wall, the entrance in a bottom corner, tables in even rows.

When a current plan is given and the manager asks for a change, return the whole plan with only that change: keep every other hall and item with its id, label and position. Keep ids of items you keep or move; new items get an empty id.

reply: one or two short sentences in Russian to the manager, saying what you drew and what you assumed (sizes, which wall). If something important is unclear, draw your best guess and ask about it in the reply. Never more than ${MAX_HALLS} halls or ${MAX_ITEMS} items.`;

/** True when a Claude call can be made (the AI Gateway on Netlify, or a key set by hand). */
export function aiAvailable(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export async function draftWithClaude(text: string, current: Plan | null, sketch: Sketch | null): Promise<Draft> {
  const client = new Anthropic({ maxRetries: 1, timeout: 55_000 });
  const content: Anthropic.ContentBlockParam[] = [];
  if (sketch) content.push({ type: "image", source: { type: "base64", media_type: sketch.mediaType, data: sketch.data } });
  if (current && current.items.length) {
    content.push({ type: "text", text: `Current plan:\n${JSON.stringify(current)}` });
  }
  content.push({ type: "text", text: text || "Нарисуй план по наброску." });

  // Streamed so a long answer never hits an HTTP timeout; low effort keeps the
  // answer inside the 60-second limit of a Netlify function. Server-side model
  // fallbacks need a beta header the AI Gateway does not pass through, so a
  // refusal falls back to the local parser instead.
  const stream = client.messages.stream({
    model: process.env.PLAN_AI_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("refusal");
  if (msg.stop_reason === "max_tokens") throw new Error("max_tokens");
  const textBlock = msg.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("no text");
  const raw = JSON.parse(textBlock.text) as {
    reply: string;
    halls: { id: string; name: string; name_kk: string; width: number; height: number }[];
    items: (Omit<PlanItem, "zone"> & { zone: string })[];
  };
  const plan = tidy(
    {
      halls: raw.halls.map((h) => ({ id: h.id, name: h.name, name_kk: h.name_kk || null, width: h.width, height: h.height })),
      items: raw.items.map((i) => ({ ...i, zone: isZone(i.zone) ? i.zone : null })),
    },
    current,
  );
  return { ...plan, reply: String(raw.reply || "").slice(0, 600), source: "ai" };
}

// ── Clean-up shared by both paths ────────────────────────────────────────

const clamp = (n: unknown, lo: number, hi: number, d: number) => {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
};
const half = (n: number) => Math.round(n * 2) / 2;
const overlap = (a: PlanItem, b: PlanItem, gap = 0) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

/**
 * Real ids for halls and items (kept where they match the current plan, so
 * bookings stay on their tables), everything inside its hall, and tables
 * nudged apart where they overlap.
 */
export function tidy(plan: Plan, current: Plan | null): Plan {
  const oldHalls = new Set(current?.halls.map((h) => h.id));
  const oldItems = new Set(current?.items.map((i) => i.id));
  const hallId = new Map<string, string>();
  const halls: PlanHall[] = plan.halls.slice(0, MAX_HALLS).map((h, n) => {
    const id = oldHalls.has(h.id) ? h.id : randomUUID();
    hallId.set(h.id, id);
    return {
      id,
      name: String(h.name || "").trim().slice(0, 60) || `Зал ${n + 1}`,
      name_kk: String(h.name_kk || "").trim().slice(0, 60) || null,
      width: Math.round(clamp(h.width, 20, 400, 100)),
      height: Math.round(clamp(h.height, 20, 400, 64)),
    };
  });
  if (!halls.length) halls.push({ id: randomUUID(), name: "Основной зал", name_kk: "Негізгі зал", width: 100, height: 64 });

  const used = new Set<string>();
  const items: PlanItem[] = [];
  for (const it of plan.items.slice(0, MAX_ITEMS)) {
    const hall = halls.find((h) => h.id === hallId.get(it.hall_id)) ?? halls[0];
    const kind = it.kind === "decor" ? "decor" : "table";
    const w = half(clamp(it.w, 2, hall.width, 10)), h = half(clamp(it.h, 2, hall.height, 10));
    const smin = Math.round(clamp(it.seats_min, 1, 50, 1));
    const id = it.id && oldItems.has(it.id) && !used.has(it.id) ? it.id : randomUUID();
    used.add(id);
    items.push({
      id,
      hall_id: hall.id,
      kind,
      label: String(it.label || "").trim().slice(0, 24) || (kind === "decor" ? "—" : String(items.filter((x) => x.kind === "table").length + 1)),
      shape: it.shape === "round" ? "round" : "rect",
      x: half(clamp(it.x, 0, hall.width - w, 0)),
      y: half(clamp(it.y, 0, hall.height - h, 0)),
      w,
      h,
      seats_min: smin,
      seats_max: Math.max(smin, Math.round(clamp(it.seats_max, 1, 50, smin))),
      zone: kind === "table" && isZone(it.zone) ? it.zone : null,
    });
  }

  // Tables that land on another table step down (then right) until they are clear.
  for (const hall of halls) {
    const own = items.filter((i) => i.hall_id === hall.id && i.kind === "table");
    for (let k = 1; k < own.length; k++) {
      const t = own[k];
      for (let tries = 0; tries < 60 && own.slice(0, k).some((o) => overlap(o, t, 1)); tries++) {
        if (t.y + t.h + 4 <= hall.height) t.y = half(t.y + 4);
        else {
          t.y = 0;
          t.x = half(Math.min(hall.width - t.w, t.x + 6));
        }
      }
    }
  }
  return { halls, items };
}

// ── Local parser: plain sentences, no AI ─────────────────────────────────

const WORD_NUM: Record<string, number> = {
  один: 1, одного: 1, одна: 1, одну: 1,
  два: 2, две: 2, двух: 2, двоих: 2, пара: 2, пару: 2,
  три: 3, трёх: 3, трех: 3, троих: 3,
  четыре: 4, четырёх: 4, четырех: 4, четверых: 4,
  пять: 5, пяти: 5, пятерых: 5,
  шесть: 6, шести: 6, шестерых: 6,
  семь: 7, семи: 7, семерых: 7,
  восемь: 8, восьми: 8, восьмерых: 8,
  девять: 9, девяти: 9,
  десять: 10, десяти: 10, двенадцать: 12, двенадцати: 12,
};
const NUM = `(\\d+|${Object.keys(WORD_NUM).join("|")})`;
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : WORD_NUM[s] ?? NaN);

const ZONE_WORDS: [Zone, RegExp][] = [
  ["window", /окн|витрин/],
  ["bar", /бар|стойк|каунтер/],
  ["kitchen", /кухн/],
  ["terrace", /террас|веранд|летник/],
  ["sofa", /диван|мягк/],
  ["private", /кабинет|вип|vip|отдельн/],
  ["quiet", /тих|угол|углу/],
];

type Group = { count: number; seats: number; zone: Zone | null };

/** «4 стола на двоих у окна, 3 на четверых, большой стол на 8 и бар на 6 мест». */
export function parseDescription(text: string): { groups: Group[]; width: number; height: number; decor: Set<string>; barSeats: number } {
  const s = text.toLowerCase().replace(/ё/g, "е").replace(/×|х(?=\s*\d)/g, "x");
  const dims = s.match(/(\d+(?:[.,]\d+)?)\s*(?:x|\*|на)\s*(\d+(?:[.,]\d+)?)\s*(?:м\b|метр)/);
  const width = dims ? Math.round(Number(dims[1].replace(",", ".")) * 10) : 100;
  const height = dims ? Math.round(Number(dims[2].replace(",", ".")) * 10) : 64;

  // «12 на 8 метров» is the hall, not twelve tables for eight.
  const rest = dims ? s.replace(dims[0], " ") : s;

  const decor = new Set<string>();
  if (/окн|витрин/.test(s)) decor.add("Окна");
  if (/бар|стойк|каунтер/.test(s)) decor.add("Бар");
  if (/кухн/.test(s)) decor.add("Кухня");
  if (/вход|двер/.test(s)) decor.add("Вход");
  if (/сцен/.test(s)) decor.add("Сцена");

  const barSeat = s.match(new RegExp(`(?:бар|стойк)[а-я]*\\s+(?:на\\s+)?${NUM}\\s*(?:мест|стул|человек|гост)`));
  const barSeats = barSeat ? toNum(barSeat[1]) || 0 : 0;

  const groups: Group[] = [];
  // Clauses: «4 стола на двоих у окна», «три на четверых в центре», «стол на 8».
  for (const clause of rest.split(/[,;.\n]|\sи\s|\sа\s/)) {
    const m =
      clause.match(new RegExp(`${NUM}?\\s*(?:больш[а-я]*\\s+|кругл[а-я]*\\s+|длинн[а-я]*\\s+)?(?:стол|столик)[а-я]*\\s+(?:на|по)\\s+${NUM}`)) ||
      clause.match(new RegExp(`${NUM}\\s+(?:на|по)\\s+${NUM}`));
    if (!m) continue;
    if (/бар|стойк/.test(clause) && !/стол/.test(clause)) continue; // «бар на 6 мест» is the counter
    const count = m[1] ? toNum(m[1]) : 1;
    const seats = toNum(m[2]);
    if (!Number.isFinite(count) || !Number.isFinite(seats) || count < 1 || seats < 1) continue;
    const zone = ZONE_WORDS.find(([, re]) => re.test(clause.slice((m.index ?? 0) + m[0].length) + " " + clause.slice(0, m.index ?? 0)))?.[0] ?? null;
    groups.push({ count: Math.min(count, 40), seats: Math.min(seats, 50), zone });
  }
  return { groups, width: clamp(width, 20, 400, 100), height: clamp(height, 20, 400, 64), decor, barSeats };
}

const sizeFor = (seats: number): Pick<PlanItem, "shape" | "w" | "h" | "seats_min"> =>
  seats <= 2 ? { shape: "round", w: 10, h: 10, seats_min: 1 }
  : seats <= 4 ? { shape: "rect", w: 18, h: 12, seats_min: 2 }
  : seats <= 6 ? { shape: "rect", w: 24, h: 12, seats_min: 3 }
  : { shape: "rect", w: Math.min(60, 30 + (seats - 8) * 3), h: 14, seats_min: Math.ceil(seats / 2) };

/** Lays the parsed groups out: windows on the right, the bar on top, the rest in rows. */
export function draftLocally(text: string, current: Plan | null): Draft {
  const p = parseDescription(text);
  const terraceGroups = p.groups.filter((g) => g.zone === "terrace");
  const mainGroups = p.groups.filter((g) => g.zone !== "terrace");
  const halls: PlanHall[] = [];
  const items: PlanItem[] = [];
  let n = 0;

  const layout = (name: string, name_kk: string, groups: Group[], withDecor: boolean) => {
    let height = p.height;
    for (let attempt = 0; attempt < 12; attempt++) {
      const hall: PlanHall = { id: randomUUID(), name, name_kk, width: p.width, height };
      const out: PlanItem[] = [];
      const W = hall.width, H = hall.height;
      const add = (it: Omit<PlanItem, "id" | "hall_id">) => out.push({ ...it, id: randomUUID(), hall_id: hall.id });
      const decor = (label: string, x: number, y: number, w: number, h: number) => add({ kind: "decor", label, shape: "rect", x, y, w, h, seats_min: 1, seats_max: 1, zone: null });
      const windows = withDecor && p.decor.has("Окна");
      const bar = withDecor && (p.decor.has("Бар") || p.barSeats > 0);
      const kitchen = withDecor && p.decor.has("Кухня");
      if (windows) decor("Окна", W - 3, 6, 3, H - 12);
      const topW = Math.min(50, W * 0.45);
      if (bar) decor("Бар", 6, 4, topW, 8);
      if (kitchen) decor("Кухня", bar ? 12 + topW : 6, 4, Math.min(40, W - (bar ? 24 + topW : 12) - (windows ? 6 : 0)), 8);
      if (withDecor && p.decor.has("Вход")) decor("Вход", W - (windows ? 20 : 16), H - 7, 14, 6);
      if (withDecor && p.decor.has("Сцена")) decor("Сцена", 6, H - 12, 26, 9);

      const tables = groups.flatMap((g) => Array.from({ length: g.count }, () => ({ seats: g.seats, zone: g.zone })));
      if (p.barSeats && withDecor) tables.unshift({ seats: p.barSeats, zone: "bar" as Zone });
      const place = (list: typeof tables, region: { x: number; y: number; w: number; h: number }, dir: "row" | "col", turn = false) => {
        let cx = region.x, cy = region.y, line = 0;
        const left: typeof tables = [];
        for (const t of list) {
          const base = t.zone === "bar" && t === tables[0] && p.barSeats ? { shape: "rect" as const, w: Math.min(topW, 6 + t.seats * 5), h: 6, seats_min: 1 } : sizeFor(t.seats);
          // Along a side wall a long table stands lengthwise.
          const sz = turn ? { ...base, w: base.h, h: base.w } : base;
          if (dir === "row" && cx + sz.w > region.x + region.w) { cx = region.x; cy += line + 4; line = 0; }
          if (dir === "col" && cy + sz.h > region.y + region.h) { cy = region.y; cx += line + 4; line = 0; }
          if (cx + sz.w > region.x + region.w || cy + sz.h > region.y + region.h) { left.push(t); continue; }
          const counter = t.zone === "bar" && base.h === 6;
          if (!counter) n++;
          add({ kind: "table", label: counter ? "Бар" : String(n), ...sz, x: cx, y: cy, seats_max: t.seats, zone: t.zone });
          if (dir === "row") { cx += sz.w + 4; line = Math.max(line, sz.h); } else { cy += sz.h + 4; line = Math.max(line, sz.w); }
        }
        return left;
      };
      const startN = n;
      const top = bar || kitchen ? 16 : 6;
      const byWindow = tables.filter((t) => t.zone === "window");
      const byBar = tables.filter((t) => t.zone === "bar" || t.zone === "kitchen");
      const sofas = tables.filter((t) => t.zone === "sofa");
      const rest = tables.filter((t) => !byWindow.includes(t) && !byBar.includes(t) && !sofas.includes(t));
      const colW = byWindow.length ? Math.max(...byWindow.map((t) => sizeFor(t.seats).w)) : 0;
      const sofaW = sofas.length ? Math.max(...sofas.map((t) => sizeFor(t.seats).h)) : 0;
      let left = [
        ...place(byWindow, { x: W - 3 - 3 - colW, y: top, w: colW, h: H - top - 10 }, "col"),
        ...place(byBar, { x: 6, y: top, w: W - 12 - (colW ? colW + 8 : 0), h: 14 }, "row"),
        ...place(sofas, { x: 4, y: top + (byBar.length ? 18 : 0), w: sofaW, h: H - top - 12 - (byBar.length ? 18 : 0) }, "col", true),
      ];
      const restTop = top + (byBar.length ? 18 : 0);
      const restLeft = sofas.length ? 4 + sofaW + 6 : 6;
      left = [...left, ...place(rest, { x: restLeft, y: restTop, w: W - restLeft - 6 - (colW ? colW + 8 : 0), h: H - restTop - 10 }, "row")];
      if (!left.length || height >= 400 || attempt === 11) {
        halls.push(hall);
        items.push(...out);
        return;
      }
      n = startN;
      height = Math.min(400, height + 20);
    }
  };

  if (mainGroups.length || !terraceGroups.length) layout(current?.halls[0]?.name || "Основной зал", current?.halls[0]?.name_kk || "Негізгі зал", mainGroups, true);
  if (terraceGroups.length) layout("Терраса", "Терраса", terraceGroups, !mainGroups.length);

  const tables = items.filter((i) => i.kind === "table");
  const seats = tables.reduce((a, t) => a + t.seats_max, 0);
  const reply = tables.length
    ? `Черновик без ИИ: ${tables.length} ${plural(tables.length, ["стол", "стола", "столов"])} на ${seats} ${plural(seats, ["место", "места", "мест"])}${halls.length > 1 ? `, ${halls.length} зала` : ""}. Двигайте столы руками или уточните описание.`
    : "Не нашёл в описании столов. Напишите так: «4 стола на двоих у окна, 3 на четверых, бар на 6 мест».";
  return { ...tidy({ halls, items }, null), reply, source: "local" };
}

function plural(n: number, f: [string, string, string]) {
  const a = n % 10, b = n % 100;
  return a === 1 && b !== 11 ? f[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? f[1] : f[2];
}
