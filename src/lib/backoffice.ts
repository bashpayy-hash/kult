import "server-only";
import { db } from "./db";

// The venue's back office (18 Nov 2026): invoices read from photos and
// checked, stock with reorder points, orders to suppliers. One page,
// /m/<manager_token>, for the venue's manager; no login, the token is the key.
// Stage 2 (19 Nov 2026): invoices checked against the order that was sent,
// payments, write-offs, dishes with their cost from the last prices paid.

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export type ManagerVenue = { id: string; name: string };
export type Supplier = { id: string; name: string; phone: string | null; notes: string | null };
export type Issue = { kind: "sum" | "total" | "duplicate" | "price" | "order"; text: string };
export type InvoiceLine = { name: string; qty: number | null; unit: string | null; price: number | null; sum: number | null };
export type InvoiceRow = {
  id: string;
  supplier_name: string | null;
  number: string | null;
  invoice_date: string | null;
  total: number | null;
  photo_path: string | null;
  issues: Issue[];
  lines: InvoiceLine[];
  /** Almaty date it was marked paid, or null while it is still to pay. */
  paid_on: string | null;
};
export type StockItem = {
  id: string;
  name: string;
  unit: string | null;
  on_hand: number;
  min_qty: number | null;
  par_qty: number | null;
  supplier_id: string | null;
  last_price: number | null;
};

/** «Томаты (сливовидные)» and «томаты сливовидные» are the same goods. */
export function itemKey(name: string): string {
  return name.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 120);
}

export async function managerVenue(token: string): Promise<ManagerVenue | null> {
  if (!TOKEN_RE.test(token)) return null;
  const [v] = await db()<ManagerVenue[]>`select id, name from venues where manager_token = ${token} and status <> 'archived'`;
  return v ?? null;
}

const n = (x: unknown) => (x === null || x === undefined ? null : Number(x));

export async function loadSuppliers(venueId: string): Promise<Supplier[]> {
  return db()<Supplier[]>`select id, name, phone, notes from suppliers where venue_id = ${venueId} order by name`;
}

/** jsonb read back as written; a stray string or object counts as no issues rather than breaking the page. */
function issuesOf(x: unknown): Issue[] {
  let v = x;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v) ? v.filter((i): i is Issue => !!i && typeof i.text === "string") : [];
}

export async function loadInvoices(venueId: string, limit = 30): Promise<InvoiceRow[]> {
  const sql = db();
  const invoices = await sql<(Omit<InvoiceRow, "lines" | "total" | "issues"> & { total: string | null; issues: unknown })[]>`
    select id, coalesce(supplier_name, (select name from suppliers s where s.id = i.supplier_id)) as supplier_name,
           number, invoice_date::text, total, photo_path, issues,
           (paid_at at time zone 'Asia/Almaty')::date::text as paid_on
    from invoices i where venue_id = ${venueId}
    order by invoice_date desc nulls last, created_at desc limit ${limit}`;
  if (!invoices.length) return [];
  const lines = await sql<(InvoiceLine & { invoice_id: string })[]>`
    select invoice_id, name, qty, unit, price, sum from invoice_lines
    where invoice_id = any(${invoices.map((i) => i.id)}::uuid[]) order by sort`;
  return invoices.map((i) => ({
    ...i,
    issues: issuesOf(i.issues),
    total: n(i.total),
    lines: lines.filter((l) => l.invoice_id === i.id).map((l) => ({ name: l.name, qty: n(l.qty), unit: l.unit, price: n(l.price), sum: n(l.sum) })),
  }));
}

export async function loadStock(venueId: string): Promise<StockItem[]> {
  const rows = await db()<StockItem[]>`
    select id, name, unit, on_hand, min_qty, par_qty, supplier_id, last_price from stock_items
    where venue_id = ${venueId} order by name`;
  return rows.map((r) => ({ ...r, on_hand: Number(r.on_hand), min_qty: n(r.min_qty), par_qty: n(r.par_qty), last_price: n(r.last_price) }));
}

export const money = (x: number) => `${Math.round(x).toLocaleString("ru-RU").replace(/ /g, " ")} ₸`;

/**
 * What a manager should look at before paying: lines whose sum is not qty ×
 * price, a total that is not the sum of the lines, the same invoice number
 * from the same supplier twice, and goods that cost more than last time.
 */
export async function checkInvoice(
  venueId: string,
  inv: { supplierId: string | null; supplierName: string | null; number: string | null; total: number | null; lines: InvoiceLine[] },
): Promise<{ issues: Issue[]; rises: Rise[] }> {
  const issues: Issue[] = [];
  const rises: Rise[] = [];
  let linesTotal = 0;
  for (const l of inv.lines) {
    if (l.qty != null && l.price != null && l.sum != null && Math.abs(l.qty * l.price - l.sum) > Math.max(1, l.sum * 0.005)) {
      issues.push({ kind: "sum", text: `${l.name}: ${l.qty} × ${money(l.price)} = ${money(l.qty * l.price)}, а в накладной ${money(l.sum)}` });
    }
    linesTotal += l.sum ?? (l.qty != null && l.price != null ? l.qty * l.price : 0);
  }
  if (inv.total != null && inv.lines.length && Math.abs(linesTotal - inv.total) > Math.max(1, inv.total * 0.005)) {
    issues.push({ kind: "total", text: `Сумма строк ${money(linesTotal)}, а итог накладной ${money(inv.total)}` });
  }
  const sql = db();
  if (inv.number) {
    const [dup] = await sql<{ invoice_date: string | null }[]>`
      select invoice_date::text from invoices
      where venue_id = ${venueId} and number = ${inv.number}
        and (supplier_id is not distinct from ${inv.supplierId} or lower(coalesce(supplier_name, '')) = lower(${inv.supplierName ?? ""}))
      limit 1`;
    if (dup) issues.push({ kind: "duplicate", text: `Накладная № ${inv.number} от этого поставщика уже внесена${dup.invoice_date ? ` (${dup.invoice_date})` : ""}` });
  }
  const keys = inv.lines.filter((l) => l.price != null).map((l) => itemKey(l.name));
  if (keys.length) {
    const last = await sql<{ key: string; price: string; invoice_date: string | null }[]>`
      select distinct on (l.key) l.key, l.price, i.invoice_date::text
      from invoice_lines l join invoices i on i.id = l.invoice_id
      where i.venue_id = ${venueId} and l.key = any(${keys}) and l.price is not null
      order by l.key, i.invoice_date desc nulls last, i.created_at desc`;
    // Goods first entered by hand have no invoice yet: their stock price counts as the last one.
    const missing = keys.filter((k) => !last.some((x) => x.key === k));
    const fromStock = missing.length
      ? await sql<{ key: string; price: string }[]>`
          select key, last_price as price from stock_items where venue_id = ${venueId} and key = any(${missing}) and last_price is not null`
      : [];
    for (const l of inv.lines) {
      const prev = last.find((x) => x.key === itemKey(l.name)) ?? fromStock.find((x) => x.key === itemKey(l.name));
      if (!prev || l.price == null) continue;
      const was = Number(prev.price);
      if (was > 0 && l.price > was * 1.03) {
        issues.push({ kind: "price", text: `${l.name}: ${money(l.price)}${l.unit ? ` за ${l.unit}` : ""}, было ${money(was)} (+${Math.round((l.price / was - 1) * 100)}%)` });
        rises.push({ key: itemKey(l.name), name: l.name, was, now: l.price });
      }
    }
  }
  return { issues, rises };
}

export type Rise = { key: string; name: string; was: number; now: number };

export type OrderLine = { name: string; key: string; qty: number; unit: string | null; price: number | null };
export type OrderGroup = { key: string; supplier: Supplier | null; lines: OrderLine[]; text: string };

/** What runs low and is not on its way yet, grouped by supplier, with a message ready for WhatsApp. */
export function orderDraft(venueName: string, stock: StockItem[], suppliers: Supplier[], dateLabel: string, onTheWay: Set<string> = new Set()): OrderGroup[] {
  const low = stock.filter((s) => s.min_qty != null && s.on_hand <= s.min_qty && !onTheWay.has(itemKey(s.name)));
  const groups = new Map<string, OrderGroup>();
  for (const s of low) {
    const target = s.par_qty ?? (s.min_qty ?? 0) * 2;
    const qty = Math.max(0, Math.ceil((target - s.on_hand) * 10) / 10);
    if (!qty) continue;
    const sup = suppliers.find((x) => x.id === s.supplier_id) ?? null;
    const k = sup?.id ?? "none";
    if (!groups.has(k)) groups.set(k, { key: k, supplier: sup, lines: [], text: "" });
    groups.get(k)!.lines.push({ name: s.name, key: itemKey(s.name), qty, unit: s.unit, price: s.last_price });
  }
  for (const g of groups.values()) {
    const list = g.lines.map((l) => `— ${l.name}: ${amount(l.qty, l.unit)}`).join("\n");
    g.text = `Здравствуйте! Заказ для ${venueName} на ${dateLabel}:\n${list}\nСпасибо!`;
  }
  // Suppliers first, «без поставщика» last.
  return [...groups.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "", "ru"));
}

export const qtyText = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");

// Whole words agree with the number («8 пучков», «2 пачки»); abbreviations
// (кг, л, шт) stay as they are. A fraction takes the genitive singular
// («0,2 пучка»).
const UNIT_FORMS: Record<string, [string, string, string]> = {
  пучок: ["пучок", "пучка", "пучков"],
  пачка: ["пачка", "пачки", "пачек"],
  упаковка: ["упаковка", "упаковки", "упаковок"],
  банка: ["банка", "банки", "банок"],
  бутылка: ["бутылка", "бутылки", "бутылок"],
  коробка: ["коробка", "коробки", "коробок"],
  ящик: ["ящик", "ящика", "ящиков"],
  мешок: ["мешок", "мешка", "мешков"],
  штука: ["штука", "штуки", "штук"],
};
export function unitWord(qty: number, unit: string | null): string {
  if (!unit) return "";
  const f = UNIT_FORMS[unit.toLowerCase()];
  if (!f) return unit;
  if (!Number.isInteger(Math.round(qty * 1000) / 1000)) return f[1];
  const a = Math.abs(qty) % 100, b = a % 10;
  return a > 10 && a < 20 ? f[2] : b === 1 ? f[0] : b > 1 && b < 5 ? f[1] : f[2];
}
/** «8 пучков», «1,5 кг». */
export const amount = (qty: number, unit: string | null) => `${qtyText(qty)}${unit ? ` ${unitWord(qty, unit)}` : ""}`;

export type SupplierOrder = { id: string; supplier_id: string | null; supplier_name: string | null; lines: OrderLine[]; created_at: string };

/** Orders sent in the last two weeks that no invoice has answered yet. */
export async function loadOpenOrders(venueId: string): Promise<SupplierOrder[]> {
  const rows = await db()<(Omit<SupplierOrder, "lines" | "created_at"> & { lines: unknown; created_at: Date })[]>`
    select id, supplier_id, coalesce((select name from suppliers s where s.id = o.supplier_id), supplier_name) as supplier_name, lines, created_at
    from supplier_orders o where venue_id = ${venueId} and status = 'sent' and created_at > now() - interval '14 days'
    order by created_at desc`;
  return rows.map((r) => ({ ...r, created_at: r.created_at.toISOString(), lines: linesOf(r.lines) }));
}

function linesOf(x: unknown): OrderLine[] {
  let v = x;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v)
    ? v.filter((l) => l && typeof l.name === "string").map((l) => ({ name: l.name, key: String(l.key ?? itemKey(l.name)), qty: Number(l.qty) || 0, unit: l.unit ?? null, price: l.price == null ? null : Number(l.price) }))
    : [];
}

/**
 * The invoice against the order sent to the same supplier: goods that did
 * not come, came short, or were not ordered. Returns the order it answers.
 */
export async function checkAgainstOrder(venueId: string, supplierId: string | null, lines: InvoiceLine[]): Promise<{ orderId: string | null; issues: Issue[] }> {
  if (!supplierId) return { orderId: null, issues: [] };
  const [o] = await db()<{ id: string; lines: unknown }[]>`
    select id, lines from supplier_orders
    where venue_id = ${venueId} and supplier_id = ${supplierId} and status = 'sent' and created_at > now() - interval '14 days'
    order by created_at desc limit 1`;
  if (!o) return { orderId: null, issues: [] };
  const ordered = linesOf(o.lines);
  const got = new Map<string, number>();
  for (const l of lines) got.set(itemKey(l.name), (got.get(itemKey(l.name)) ?? 0) + (l.qty ?? 0));
  const issues: Issue[] = [];
  for (const ol of ordered) {
    const q = got.get(ol.key);
    if (q === undefined) issues.push({ kind: "order", text: `Не привезли: ${ol.name} — ${amount(ol.qty, ol.unit)} по заказу` });
    else if (q < ol.qty * 0.98) issues.push({ kind: "order", text: `Недовоз: ${ol.name} — ${qtyText(q)} из ${amount(ol.qty, ol.unit)}` });
  }
  const orderedKeys = new Set(ordered.map((l) => l.key));
  const extra = lines.filter((l) => !orderedKeys.has(itemKey(l.name))).map((l) => l.name);
  if (extra.length) issues.push({ kind: "order", text: `Не заказывали: ${extra.join(", ")}` });
  return { orderId: o.id, issues };
}

export const WRITE_OFF_REASONS = { spoiled: "Испортилось", staff: "Питание персонала", defect: "Брак поставщика", other: "Другое" } as const;
export type WriteOffReason = keyof typeof WRITE_OFF_REASONS;
export type WriteOff = { id: string; name: string; qty: number; unit: string | null; reason: WriteOffReason; cost: number | null; note: string | null; day: string };

export async function loadWriteOffs(venueId: string, sinceDays = 30): Promise<WriteOff[]> {
  const rows = await db()<(Omit<WriteOff, "qty" | "cost"> & { qty: string; cost: string | null })[]>`
    select id, name, qty, unit, reason, cost, note, (created_at at time zone 'Asia/Almaty')::date::text as day
    from write_offs where venue_id = ${venueId} and created_at > now() - make_interval(days => ${sinceDays})
    order by created_at desc limit 100`;
  return rows.map((r) => ({ ...r, qty: Number(r.qty), cost: n(r.cost) }));
}

export type DishItem = { stock_item_id: string; name: string; unit: string | null; qty: number; price: number | null; cost: number | null };
export type Dish = {
  id: string;
  name: string;
  menu_price: number | null;
  items: DishItem[];
  cost: number;
  /** Some ingredient has no price yet: the cost is a lower bound. */
  partial: boolean;
  /** How much the last deliveries moved the cost, and because of what. */
  delta: number;
  deltaFrom: string[];
};

/** Per goods key: the price on the latest invoice and on the one before it. */
async function lastTwoPrices(venueId: string): Promise<Map<string, { last: number; prev: number | null }>> {
  const rows = await db()<{ key: string; price: string; rn: number }[]>`
    select key, price, rn from (
      select l.key, l.price, row_number() over (partition by l.key order by i.invoice_date desc nulls last, i.created_at desc) as rn
      from invoice_lines l join invoices i on i.id = l.invoice_id
      where i.venue_id = ${venueId} and l.price is not null
    ) x where rn <= 2`;
  const m = new Map<string, { last: number; prev: number | null }>();
  for (const r of rows) {
    const e = m.get(r.key) ?? { last: 0, prev: null };
    if (Number(r.rn) === 1) e.last = Number(r.price);
    else e.prev = Number(r.price);
    m.set(r.key, e);
  }
  return m;
}

export async function loadDishes(venueId: string, stock: StockItem[]): Promise<Dish[]> {
  const sql = db();
  const [dishes, items, prices] = await Promise.all([
    sql<{ id: string; name: string; menu_price: string | null }[]>`select id, name, menu_price from dishes where venue_id = ${venueId} order by name`,
    sql<{ dish_id: string; stock_item_id: string; qty: string }[]>`
      select di.dish_id, di.stock_item_id, di.qty from dish_items di join dishes d on d.id = di.dish_id
      where d.venue_id = ${venueId} order by di.sort, di.id`,
    lastTwoPrices(venueId),
  ]);
  return dishes.map((d) => {
    let cost = 0, delta = 0, partial = false;
    const deltaFrom: string[] = [];
    const list: DishItem[] = items
      .filter((i) => i.dish_id === d.id)
      .map((i) => {
        const s = stock.find((x) => x.id === i.stock_item_id);
        const qty = Number(i.qty);
        const price = s?.last_price ?? null;
        const c = price == null ? null : qty * price;
        if (c == null) partial = true;
        else cost += c;
        const p = s ? prices.get(itemKey(s.name)) : undefined;
        if (s && p && p.prev != null && p.last === price && p.last !== p.prev) {
          delta += qty * (p.last - p.prev);
          deltaFrom.push(s.name);
        }
        return { stock_item_id: i.stock_item_id, name: s?.name ?? "—", unit: s?.unit ?? null, qty, price, cost: c };
      });
    return { id: d.id, name: d.name, menu_price: n(d.menu_price), items: list, cost, partial, delta, deltaFrom };
  });
}

/** Dishes a price rise reaches, and by how much per portion. */
export async function dishImpact(venueId: string, rises: Rise[]): Promise<{ dish: string; delta: number }[]> {
  if (!rises.length) return [];
  const rows = await db()<{ dish: string; key: string; qty: string }[]>`
    select d.name as dish, s.key, di.qty from dish_items di
    join dishes d on d.id = di.dish_id join stock_items s on s.id = di.stock_item_id
    where d.venue_id = ${venueId} and s.key = any(${rises.map((r) => r.key)})`;
  const by = new Map<string, number>();
  for (const r of rows) {
    const rise = rises.find((x) => x.key === r.key)!;
    by.set(r.dish, (by.get(r.dish) ?? 0) + Number(r.qty) * (rise.now - rise.was));
  }
  return [...by.entries()].map(([dish, delta]) => ({ dish, delta })).sort((a, b) => b.delta - a.delta);
}

/** wa.me link with the order text; WhatsApp opens with it typed, the manager sends it. */
export function whatsappLink(phone: string | null, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
