import "server-only";
import { db } from "./db";

// The venue's back office (18 Nov 2026): invoices read from photos and
// checked, stock with reorder points, orders to suppliers. One page,
// /m/<manager_token>, for the venue's manager; no login, the token is the key.

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export type ManagerVenue = { id: string; name: string };
export type Supplier = { id: string; name: string; phone: string | null; notes: string | null };
export type Issue = { kind: "sum" | "total" | "duplicate" | "price"; text: string };
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
  const invoices = await sql<(Omit<InvoiceRow, "lines" | "total"> & { total: string | null })[]>`
    select id, coalesce(supplier_name, (select name from suppliers s where s.id = i.supplier_id)) as supplier_name,
           number, invoice_date::text, total, photo_path, issues
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

const money = (x: number) => `${Math.round(x).toLocaleString("ru-RU").replace(/ /g, " ")} ₸`;

/**
 * What a manager should look at before paying: lines whose sum is not qty ×
 * price, a total that is not the sum of the lines, the same invoice number
 * from the same supplier twice, and goods that cost more than last time.
 */
export async function checkInvoice(
  venueId: string,
  inv: { supplierId: string | null; supplierName: string | null; number: string | null; total: number | null; lines: InvoiceLine[] },
): Promise<Issue[]> {
  const issues: Issue[] = [];
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
    for (const l of inv.lines) {
      const prev = last.find((x) => x.key === itemKey(l.name));
      if (!prev || l.price == null) continue;
      const was = Number(prev.price);
      if (was > 0 && l.price > was * 1.03) {
        issues.push({ kind: "price", text: `${l.name}: ${money(l.price)}${l.unit ? ` за ${l.unit}` : ""}, было ${money(was)} (+${Math.round((l.price / was - 1) * 100)}%)` });
      }
    }
  }
  return issues;
}

export type OrderGroup = { supplier: Supplier | null; lines: { name: string; qty: number; unit: string | null }[]; text: string };

/** What runs low, grouped by supplier, with a message ready for WhatsApp. */
export function orderDraft(venueName: string, stock: StockItem[], suppliers: Supplier[], dateLabel: string): OrderGroup[] {
  const low = stock.filter((s) => s.min_qty != null && s.on_hand <= s.min_qty);
  const groups = new Map<string, OrderGroup>();
  for (const s of low) {
    const target = s.par_qty ?? (s.min_qty ?? 0) * 2;
    const qty = Math.max(0, Math.ceil((target - s.on_hand) * 10) / 10);
    if (!qty) continue;
    const sup = suppliers.find((x) => x.id === s.supplier_id) ?? null;
    const k = sup?.id ?? "none";
    if (!groups.has(k)) groups.set(k, { supplier: sup, lines: [], text: "" });
    groups.get(k)!.lines.push({ name: s.name, qty, unit: s.unit });
  }
  for (const g of groups.values()) {
    const list = g.lines.map((l) => `— ${l.name}: ${String(l.qty).replace(".", ",")}${l.unit ? ` ${l.unit}` : ""}`).join("\n");
    g.text = `Здравствуйте! Заказ для ${venueName} на ${dateLabel}:\n${list}\nСпасибо!`;
  }
  // Suppliers first, «без поставщика» last.
  return [...groups.values()].sort((a, b) => (a.supplier ? 0 : 1) - (b.supplier ? 0 : 1) || (a.supplier?.name ?? "").localeCompare(b.supplier?.name ?? "", "ru"));
}

/** wa.me link with the order text; WhatsApp opens with it typed, the manager sends it. */
export function whatsappLink(phone: string | null, text: string): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
