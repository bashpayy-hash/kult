"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { isUuid, str, strOrNull } from "@/lib/forms";
import { normalizePhone } from "@/lib/format";
import {
  checkAgainstOrder,
  checkInvoice,
  dishImpact,
  itemKey,
  loadOpenOrders,
  loadStock,
  loadSuppliers,
  managerVenue,
  orderDraft,
  WRITE_OFF_REASONS,
  type Issue,
  type InvoiceLine,
  type ManagerVenue,
} from "@/lib/backoffice";
import { countShelfPhoto, draftDishItems, readInvoicePhoto, type InvoiceDraft, type ShelfCount } from "@/lib/backofficeAi";
import { aiAvailable, type Sketch } from "@/lib/planDraft";
import { fileFrom, removeImage, uploadImage, UploadError } from "@/lib/storage";
import type { FormState } from "@/lib/types";

// Every action re-reads the venue from the manager's token and touches only
// that venue's rows. No login: the token is the key, as on the hostess page.

async function venueFor(fd: FormData): Promise<(ManagerVenue & { token: string }) | null> {
  const token = str(fd, "token", 64);
  const v = await managerVenue(token);
  return v ? { ...v, token } : null;
}

const done = (v: { token: string }) => revalidatePath(`/m/${v.token}`);

function numOrNull(x: unknown): number | null {
  if (x === null || x === undefined || x === "") return null;
  const v = Number(String(x).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

async function photoOf(fd: FormData): Promise<{ sketch: Sketch; file: File } | { error: string }> {
  const file = fileFrom(fd, "photo");
  if (!file) return { error: "Сфотографируйте или выберите фото." };
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return { error: "Нужна картинка JPG, PNG или WebP." };
  if (file.size > 3.5 * 1024 * 1024) return { error: "Фото больше 3,5 МБ. Снимите в меньшем размере." };
  return { sketch: { data: Buffer.from(await file.arrayBuffer()).toString("base64"), mediaType: file.type as Sketch["mediaType"] }, file };
}

export type ReadResult = { ok: true; draft: InvoiceDraft } | { ok: false; error: string };

/** Photo of an invoice → a draft of its lines. Nothing is stored until the manager saves. */
export async function readInvoice(fd: FormData): Promise<ReadResult> {
  const v = await venueFor(fd);
  if (!v) return { ok: false, error: "Ссылка не работает. Попросите новую у администратора." };
  if (!aiAvailable()) return { ok: false, error: "ИИ не подключён: введите строки вручную." };
  const p = await photoOf(fd);
  if ("error" in p) return { ok: false, error: p.error };
  try {
    return { ok: true, draft: await readInvoicePhoto(p.sketch) };
  } catch (e) {
    console.error("invoice read failed", e);
    return { ok: false, error: "Не удалось прочитать фото. Снимите ровнее при хорошем свете или введите строки вручную." };
  }
}

export type SaveResult = { ok: true; issues: Issue[]; impacts: { dish: string; delta: number }[] } | { ok: false; error: string };

/** Saves a checked invoice and adds its goods to the stock. */
export async function saveInvoice(fd: FormData): Promise<SaveResult> {
  const v = await venueFor(fd);
  if (!v) return { ok: false, error: "Ссылка не работает." };
  let raw: { supplierId?: string; supplierName?: string; number?: string; date?: string; total?: unknown; lines?: unknown[] };
  try {
    raw = JSON.parse(String(fd.get("invoice") || "{}"));
  } catch {
    return { ok: false, error: "Накладная не прочиталась. Обновите страницу." };
  }
  const lines: InvoiceLine[] = (Array.isArray(raw.lines) ? raw.lines : [])
    .slice(0, 80)
    .map((l) => {
      const x = l as Record<string, unknown>;
      return { name: String(x.name ?? "").trim().slice(0, 120), qty: numOrNull(x.qty), unit: String(x.unit ?? "").trim().slice(0, 12) || null, price: numOrNull(x.price), sum: numOrNull(x.sum) };
    })
    .filter((l) => l.name);
  if (!lines.length) return { ok: false, error: "Добавьте хотя бы одну строку." };
  const sql = db();
  let supplierId = raw.supplierId && isUuid(raw.supplierId) ? raw.supplierId : null;
  if (supplierId) {
    const [s] = await sql`select 1 from suppliers where id = ${supplierId} and venue_id = ${v.id}`;
    if (!s) supplierId = null;
  }
  const supplierName = String(raw.supplierName ?? "").trim().slice(0, 80) || null;
  const number = String(raw.number ?? "").trim().slice(0, 40) || null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date)) ? String(raw.date) : null;
  const total = numOrNull(raw.total);
  // The photo travels with the save, so a draft that is never saved leaves nothing behind.
  let photo: string | null = null;
  const file = fileFrom(fd, "photo");
  if (file) {
    try {
      photo = await uploadImage("invoices", v.id, file);
    } catch (e) {
      if (!(e instanceof UploadError)) console.error("invoice photo not stored", e);
    }
  }

  const { issues, rises } = await checkInvoice(v.id, { supplierId, supplierName, number, total, lines });
  // Against the order sent to this supplier: what came short or not at all.
  const order = await checkAgainstOrder(v.id, supplierId, lines);
  issues.push(...order.issues);
  try {
    await sql.begin(async (tx) => {
      const [inv] = await tx<{ id: string }[]>`
        insert into invoices (venue_id, supplier_id, supplier_name, number, invoice_date, total, photo_path, issues, order_id)
        values (${v.id}, ${supplierId}, ${supplierName}, ${number}, ${date ?? null}, ${total}, ${photo}, ${tx.json(issues)}, ${order.orderId})
        returning id`;
      if (order.orderId) {
        await tx`update supplier_orders set status = 'received', invoice_id = ${inv.id}, received_at = now() where id = ${order.orderId} and venue_id = ${v.id}`;
      }
      for (const [i, l] of lines.entries()) {
        await tx`
          insert into invoice_lines (invoice_id, name, key, qty, unit, price, sum, sort)
          values (${inv.id}, ${l.name}, ${itemKey(l.name)}, ${l.qty}, ${l.unit}, ${l.price}, ${l.sum}, ${i})`;
        // The goods arrive in stock: the amount adds up, the price is the latest.
        await tx`
          insert into stock_items (venue_id, name, key, unit, on_hand, supplier_id, last_price)
          values (${v.id}, ${l.name}, ${itemKey(l.name)}, ${l.unit}, ${l.qty ?? 0}, ${supplierId}, ${l.price})
          on conflict (venue_id, key) do update set
            on_hand = stock_items.on_hand + excluded.on_hand,
            last_price = coalesce(excluded.last_price, stock_items.last_price),
            unit = coalesce(stock_items.unit, excluded.unit),
            supplier_id = coalesce(stock_items.supplier_id, excluded.supplier_id),
            updated_at = now()`;
      }
    });
  } catch (e) {
    console.error("invoice save failed", e);
    if (photo) await removeImage("invoices", photo);
    return { ok: false, error: "Не удалось сохранить. Попробуйте ещё раз." };
  }
  done(v);
  return { ok: true, issues, impacts: await dishImpact(v.id, rises).catch(() => []) };
}

/** A mistaken invoice goes, and its goods leave the stock again. */
export async function deleteInvoice(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  const sql = db();
  const photo = await sql.begin(async (tx) => {
    const [inv] = await tx<{ photo_path: string | null }[]>`select photo_path from invoices where id = ${id} and venue_id = ${v.id}`;
    if (!inv) return null;
    await tx`
      update stock_items s set on_hand = greatest(0, s.on_hand - l.qty), updated_at = now()
      from invoice_lines l where l.invoice_id = ${id} and l.qty is not null and s.venue_id = ${v.id} and s.key = l.key`;
    const keys = (await tx<{ key: string }[]>`select distinct key from invoice_lines where invoice_id = ${id}`).map((r) => r.key);
    // The order it answered waits for its delivery again.
    await tx`update supplier_orders set status = 'sent', invoice_id = null, received_at = null where invoice_id = ${id} and venue_id = ${v.id}`;
    await tx`delete from invoices where id = ${id}`;
    // The last price paid comes from the invoices that remain.
    if (keys.length) {
      await tx`
        update stock_items s set last_price = p.price
        from (
          select distinct on (l.key) l.key, l.price from invoice_lines l join invoices i on i.id = l.invoice_id
          where i.venue_id = ${v.id} and l.key = any(${keys}) and l.price is not null
          order by l.key, i.invoice_date desc nulls last, i.created_at desc
        ) p
        where s.venue_id = ${v.id} and s.key = p.key`;
    }
    return inv.photo_path;
  });
  if (photo) await removeImage("invoices", photo);
  done(v);
}

export type CountResult = { ok: true; count: ShelfCount } | { ok: false; error: string };

export async function countShelf(fd: FormData): Promise<CountResult> {
  const v = await venueFor(fd);
  if (!v) return { ok: false, error: "Ссылка не работает." };
  if (!aiAvailable()) return { ok: false, error: "ИИ не подключён: впишите остатки руками." };
  const p = await photoOf(fd);
  if ("error" in p) return { ok: false, error: p.error };
  const known = await db()<{ name: string; unit: string | null }[]>`select name, unit from stock_items where venue_id = ${v.id} order by name limit 200`;
  try {
    return { ok: true, count: await countShelfPhoto(p.sketch, known) };
  } catch (e) {
    console.error("shelf count failed", e);
    return { ok: false, error: "Не удалось посчитать по фото. Снимите ближе и ровнее." };
  }
}

/** Counted on hand, from a recount: known goods get the number, new ones are added. */
export async function setCounts(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await venueFor(fd);
  if (!v) return { error: "Ссылка не работает." };
  let rows: { name?: string; count?: unknown; unit?: string }[];
  try {
    rows = JSON.parse(String(fd.get("counts") || "[]"));
  } catch {
    return { error: "Не прочиталось. Обновите страницу." };
  }
  const sql = db();
  for (const r of rows.slice(0, 80)) {
    const name = String(r.name ?? "").trim().slice(0, 120);
    const count = numOrNull(r.count);
    if (!name || count === null || count < 0) continue;
    await sql`
      insert into stock_items (venue_id, name, key, unit, on_hand) values (${v.id}, ${name}, ${itemKey(name)}, ${String(r.unit ?? "").slice(0, 12) || null}, ${count})
      on conflict (venue_id, key) do update set on_hand = excluded.on_hand, updated_at = now()`;
  }
  done(v);
  return { ok: true, message: "Остатки записаны" };
}

export async function saveStockItem(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await venueFor(fd);
  if (!v) return { error: "Ссылка не работает." };
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 120);
  if (!name) return { error: "Напишите название." };
  const unit = strOrNull(fd, "unit", 12);
  const onHand = numOrNull(fd.get("on_hand")) ?? 0;
  const min = numOrNull(fd.get("min_qty"));
  const par = numOrNull(fd.get("par_qty"));
  const supplier = str(fd, "supplier_id", 40);
  const supplierId = isUuid(supplier) ? supplier : null;
  if (onHand < 0 || (min !== null && min < 0) || (par !== null && par < 0)) return { error: "Числа не могут быть меньше нуля." };
  const sql = db();
  try {
    if (isUuid(id)) {
      await sql`
        update stock_items set name = ${name}, key = ${itemKey(name)}, unit = ${unit}, on_hand = ${onHand}, min_qty = ${min}, par_qty = ${par},
          supplier_id = (select id from suppliers where id = ${supplierId} and venue_id = ${v.id}), updated_at = now()
        where id = ${id} and venue_id = ${v.id}`;
    } else {
      await sql`
        insert into stock_items (venue_id, name, key, unit, on_hand, min_qty, par_qty, supplier_id)
        values (${v.id}, ${name}, ${itemKey(name)}, ${unit}, ${onHand}, ${min}, ${par}, (select id from suppliers where id = ${supplierId} and venue_id = ${v.id}))`;
    }
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") return { error: "Такая позиция уже есть." };
    console.error(e);
    return { error: "Не удалось сохранить." };
  }
  done(v);
  return { ok: true, message: "Сохранено" };
}

export async function deleteStockItem(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  await db()`delete from stock_items where id = ${id} and venue_id = ${v.id}`;
  done(v);
}

export async function saveSupplier(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await venueFor(fd);
  if (!v) return { error: "Ссылка не работает." };
  const name = str(fd, "name", 80);
  if (!name) return { error: "Напишите название поставщика." };
  const phoneRaw = str(fd, "phone", 40);
  const phone = phoneRaw ? normalizePhone(phoneRaw) : null;
  if (phoneRaw && !phone) return { error: "Проверьте номер телефона." };
  await db()`insert into suppliers (venue_id, name, phone, notes) values (${v.id}, ${name}, ${phone}, ${strOrNull(fd, "notes", 300)})`;
  done(v);
  return { ok: true, message: "Поставщик добавлен" };
}

export async function deleteSupplier(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  await db()`delete from suppliers where id = ${id} and venue_id = ${v.id}`;
  done(v);
}

// ── Stage 2 (19 Nov 2026): payments, orders sent, write-offs, dishes ──────

/** «Оплачено» on an invoice, or back to «к оплате». */
export async function setPaid(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  const paid = fd.get("paid") === "1";
  await db()`update invoices set paid_at = ${paid ? new Date() : null} where id = ${id} and venue_id = ${v.id}`;
  done(v);
}

/**
 * The order for one supplier is on its way. The lines are worked out here
 * again from the stock, not taken from the browser; the invoice that comes
 * back from this supplier is checked against them.
 */
export async function markOrderSent(fd: FormData): Promise<{ ok: boolean }> {
  const v = await venueFor(fd);
  const key = str(fd, "supplier", 40);
  if (!v || !(key === "none" || isUuid(key))) return { ok: false };
  const [stock, suppliers, open] = await Promise.all([loadStock(v.id), loadSuppliers(v.id), loadOpenOrders(v.id)]);
  const onTheWay = new Set(open.flatMap((o) => o.lines.map((l) => l.key)));
  const group = orderDraft(v.name, stock, suppliers, "", onTheWay).find((g) => g.key === key);
  if (!group) return { ok: false };
  await db()`
    insert into supplier_orders (venue_id, supplier_id, supplier_name, lines)
    values (${v.id}, ${group.supplier?.id ?? null}, ${group.supplier?.name ?? null}, ${db().json(group.lines)})`;
  done(v);
  return { ok: true };
}

export async function cancelOrder(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  await db()`update supplier_orders set status = 'cancelled' where id = ${id} and venue_id = ${v.id} and status = 'sent'`;
  done(v);
}

/** Spoiled, eaten by staff, a supplier's defect: the stock goes down and the loss is counted. */
export async function writeOff(_prev: FormState, fd: FormData): Promise<FormState> {
  const v = await venueFor(fd);
  if (!v) return { error: "Ссылка не работает." };
  const id = str(fd, "id", 40);
  const qty = numOrNull(fd.get("qty"));
  const reason = str(fd, "reason", 20);
  if (!isUuid(id)) return { error: "Позиция не найдена." };
  if (qty === null || qty <= 0) return { error: "Сколько списать? Число больше нуля." };
  if (!(reason in WRITE_OFF_REASONS)) return { error: "Выберите причину." };
  const note = strOrNull(fd, "note", 200);
  const sql = db();
  const ok = await sql.begin(async (tx) => {
    const [s] = await tx<{ name: string; unit: string | null; last_price: string | null }[]>`
      select name, unit, last_price from stock_items where id = ${id} and venue_id = ${v.id} for update`;
    if (!s) return false;
    const cost = s.last_price == null ? null : Math.round(qty * Number(s.last_price) * 100) / 100;
    await tx`
      insert into write_offs (venue_id, stock_item_id, name, qty, unit, reason, cost, note)
      values (${v.id}, ${id}, ${s.name}, ${qty}, ${s.unit}, ${reason}, ${cost}, ${note})`;
    await tx`update stock_items set on_hand = greatest(0, on_hand - ${qty}), updated_at = now() where id = ${id}`;
    return true;
  });
  if (!ok) return { error: "Позиция не найдена." };
  done(v);
  return { ok: true, message: "Списано" };
}

/** A write-off made by mistake: the goods come back to the stock. */
export async function deleteWriteOff(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  await db().begin(async (tx) => {
    const [w] = await tx<{ stock_item_id: string | null; qty: string }[]>`delete from write_offs where id = ${id} and venue_id = ${v.id} returning stock_item_id, qty`;
    if (w?.stock_item_id) await tx`update stock_items set on_hand = on_hand + ${Number(w.qty)}, updated_at = now() where id = ${w.stock_item_id} and venue_id = ${v.id}`;
  });
  done(v);
}

export type DishSave = { ok: true } | { ok: false; error: string };

/** A dish and what one portion takes from the stock. */
export async function saveDish(fd: FormData): Promise<DishSave> {
  const v = await venueFor(fd);
  if (!v) return { ok: false, error: "Ссылка не работает." };
  const id = str(fd, "id", 40);
  const name = str(fd, "name", 80);
  if (!name) return { ok: false, error: "Напишите название блюда." };
  const price = numOrNull(fd.get("menu_price"));
  if (price !== null && price < 0) return { ok: false, error: "Цена не может быть меньше нуля." };
  let rows: { stock_item_id?: string; qty?: unknown }[];
  try {
    rows = JSON.parse(String(fd.get("items") || "[]"));
  } catch {
    return { ok: false, error: "Состав не прочитался. Обновите страницу." };
  }
  const items = rows
    .map((r) => ({ id: String(r.stock_item_id ?? ""), qty: numOrNull(r.qty) }))
    .filter((r): r is { id: string; qty: number } => isUuid(r.id) && r.qty !== null && r.qty > 0)
    .slice(0, 40);
  if (!items.length) return { ok: false, error: "Добавьте хотя бы один продукт со склада." };
  const sql = db();
  try {
    await sql.begin(async (tx) => {
      let dishId = isUuid(id) ? id : null;
      if (dishId) {
        const [d] = await tx`update dishes set name = ${name}, menu_price = ${price} where id = ${dishId} and venue_id = ${v.id} returning id`;
        if (!d) throw new Error("not found");
        await tx`delete from dish_items where dish_id = ${dishId}`;
      } else {
        [{ id: dishId }] = await tx<{ id: string }[]>`insert into dishes (venue_id, name, menu_price) values (${v.id}, ${name}, ${price}) returning id`;
      }
      for (const [i, it] of items.entries()) {
        await tx`
          insert into dish_items (dish_id, stock_item_id, qty, sort)
          select ${dishId}, s.id, ${it.qty}, ${i} from stock_items s where s.id = ${it.id} and s.venue_id = ${v.id}`;
      }
    });
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23505") return { ok: false, error: "Блюдо с таким названием уже есть." };
    console.error("dish save failed", e);
    return { ok: false, error: "Не удалось сохранить." };
  }
  done(v);
  return { ok: true };
}

export async function deleteDish(fd: FormData): Promise<void> {
  const v = await venueFor(fd);
  const id = str(fd, "id", 40);
  if (!v || !isUuid(id)) return;
  await db()`delete from dishes where id = ${id} and venue_id = ${v.id}`;
  done(v);
}

export type DishDraftResult = { ok: true; items: { stock_item_id: string; qty: number }[]; note: string } | { ok: false; error: string };

/** «Подсказать состав»: Claude drafts one portion from the venue's own stock list. */
export async function suggestDish(fd: FormData): Promise<DishDraftResult> {
  const v = await venueFor(fd);
  if (!v) return { ok: false, error: "Ссылка не работает." };
  const name = str(fd, "name", 80);
  if (!name) return { ok: false, error: "Сначала напишите название блюда." };
  if (!aiAvailable()) return { ok: false, error: "ИИ не подключён: добавьте продукты руками." };
  const stock = await db()<{ id: string; name: string; unit: string | null }[]>`select id, name, unit from stock_items where venue_id = ${v.id} order by name limit 200`;
  if (!stock.length) return { ok: false, error: "Склад пуст: сначала внесите накладную или позиции." };
  try {
    const d = await draftDishItems(name, stock);
    const items = d.items.map((i) => ({ stock_item_id: stock.find((s) => s.name === i.name)!.id, qty: i.qty }));
    return { ok: true, items, note: items.length ? d.note : d.note || "Подходящих продуктов на складе не нашлось." };
  } catch (e) {
    console.error("dish draft failed", e);
    return { ok: false, error: "Не получилось подсказать. Добавьте продукты руками." };
  }
}
