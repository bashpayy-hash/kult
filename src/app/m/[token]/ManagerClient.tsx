"use client";

import { useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { countShelf, markOrderSent, readInvoice, saveDish, saveInvoice, setCounts, suggestDish } from "./actions";
import { ImageInput } from "@/app/admin/_ui";
import { FormError, SubmitButton } from "@/components/form";
import type { Issue, Supplier } from "@/lib/backoffice";

/** The hostess page's disclosure tile: a quiet circle with plus that turns into minus. */
export function Panel({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-tile-r bg-tile">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-5 text-left text-[16px] font-medium text-ink"
      >
        {title}
        <span aria-hidden="true" className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised">
          <span className="absolute h-[1.5px] w-3 rounded bg-ink" />
          <span className={`absolute h-3 w-[1.5px] rounded bg-ink transition-transform duration-300 ease-out ${open ? "scale-y-0" : ""}`} />
        </span>
      </button>
      {open ? <div className="sheet-in border-t border-line px-5 pb-5 pt-4">{children}</div> : null}
    </div>
  );
}

/**
 * «Изменить» under a row: the form appears in place. `end` sits on the same
 * line, right-aligned: the row's one button (e.g. «Отметить оплату»).
 */
export function Toggle({ label, children, end, start }: { label: string; children: ReactNode; end?: ReactNode; start?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <div className={start ? "flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-6" : "flex items-center justify-between gap-4"}>
        {start}
        <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="link-quiet tap shrink-0 self-start text-[14px] sm:self-auto">
          {open ? "Свернуть" : label}
        </button>
        {end}
      </div>
      {open ? <div className="sheet-in mt-2 pb-1">{children}</div> : null}
    </div>
  );
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/**
 * One action per supplier: WhatsApp opens with the order typed, and the
 * order is noted as sent, so the invoice that comes back is checked
 * against it. Without a number: copy and note.
 */
export function SendOrder({ token, supplierKey, wa, text }: { token: string; supplierKey: string; wa: string | null; text: string }) {
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const mark = async () => {
    setBusy(true);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("supplier", supplierKey);
    await markOrderSent(fd);
    setBusy(false);
  };
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {wa ? (
        <button
          type="button"
          disabled={busy}
          className="btn btn-primary btn-sm"
          onClick={() => {
            window.open(wa, "_blank", "noopener");
            void mark();
          }}
        >
          Отправить в WhatsApp
        </button>
      ) : (
        <button
          type="button"
          disabled={busy}
          className="btn btn-primary btn-sm"
          onClick={async () => {
            await copyText(text);
            await mark();
          }}
        >
          Скопировать и отметить отправленным
        </button>
      )}
      {wa ? (
        <button
          type="button"
          className="link-quiet tap text-[14px]"
          onClick={async () => {
            await copyText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1600);
          }}
        >
          {copied ? "Скопировано" : "Скопировать текст"}
        </button>
      ) : null}
    </div>
  );
}

/** Under a slow AI button: what the wait is, while it lasts. */
function Waiting({ text }: { text: string }) {
  const { pending } = useFormStatus();
  return pending ? (
    <p role="status" className="text-[14px] text-ink-3">
      {text}
    </p>
  ) : null;
}

type Line = { name: string; qty: string; unit: string; price: string; sum: string };
const emptyLine = (): Line => ({ name: "", qty: "", unit: "", price: "", sum: "" });
const show = (x: number | null) => (x == null ? "" : String(x).replace(".", ","));
const num = (x: string) => {
  const v = Number(x.replace(/\s/g, "").replace(",", "."));
  return x.trim() && Number.isFinite(v) ? v : null;
};
const money = (x: number) => `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(x)} ₸`;

/**
 * A new invoice: photo → Claude reads the lines → the manager checks them →
 * save. The server compares sums, the total, a repeated number and last
 * prices, and puts the goods on the stock.
 */
export function InvoiceNew({ token, suppliers, ai, today }: { token: string; suppliers: Supplier[]; ai: boolean; today: string }) {
  const [step, setStep] = useState<"photo" | "edit" | "done">("photo");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [supplierName, setSupplierName] = useState("");
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [total, setTotal] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine()]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [impacts, setImpacts] = useState<{ dish: string; delta: number }[]>([]);

  const reset = () => {
    setStep("photo");
    setError(null);
    setNote("");
    setFile(null);
    setSupplierId(suppliers[0]?.id ?? "");
    setSupplierName("");
    setNumber("");
    setDate(today);
    setTotal("");
    setLines([emptyLine()]);
  };

  const manual = () => {
    setError(null);
    setStep("edit");
  };

  async function read(fd: FormData) {
    setError(null);
    const photo = fd.get("photo");
    const r = await readInvoice(fd);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    const d = r.draft;
    if (photo instanceof File && photo.size) setFile(photo);
    const known = suppliers.find((s) => d.supplier && (s.name.toLowerCase().includes(d.supplier.toLowerCase()) || d.supplier.toLowerCase().includes(s.name.replace(/\s*\(.*\)$/, "").toLowerCase())));
    setSupplierId(known?.id ?? "");
    setSupplierName(known ? "" : d.supplier);
    setNumber(d.number);
    if (d.date) setDate(d.date);
    setTotal(show(d.total));
    setLines(d.lines.length ? d.lines.map((l) => ({ name: l.name, qty: show(l.qty), unit: l.unit, price: show(l.price), sum: show(l.sum) })) : [emptyLine()]);
    setNote(d.note);
    setStep("edit");
  }

  async function save(fd: FormData) {
    setError(null);
    fd.set(
      "invoice",
      JSON.stringify({
        supplierId: supplierId || null,
        supplierName: supplierId ? suppliers.find((s) => s.id === supplierId)?.name : supplierName,
        number,
        date,
        total: num(total),
        lines: lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name, qty: num(l.qty), unit: l.unit, price: num(l.price), sum: num(l.sum) })),
      }),
    );
    if (file) fd.set("photo", file);
    const r = await saveInvoice(fd);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setIssues(r.issues);
    setImpacts(r.impacts);
    setStep("done");
  }

  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const linesTotal = lines.reduce((s, l) => s + (num(l.sum) ?? ((num(l.qty) ?? 0) * (num(l.price) ?? 0))), 0);

  if (step === "done") {
    return (
      <div role="status" className="sheet-in rounded-tile-r bg-tile p-5">
        {issues.length ? (
          <>
            <p className="text-[17px] text-ink">Накладная сохранена, товар добавлен на склад.</p>
            {/* The same mark as on the invoice in the list: a red rule and one red line of heading. */}
            <div className="mt-4 border-l-2 border-danger pl-4">
              <p className="text-[13px] font-semibold text-danger">Проверьте перед оплатой</p>
              <ul className="mt-1 flex flex-col gap-1 text-[15px] text-ink-2">
                {issues.map((x, i) => (
                  <li key={i}>{x.text}</li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-[17px] text-ink">
            <span className="font-medium text-success">Всё сходится.</span> Накладная сохранена, товар добавлен на склад.
          </p>
        )}
        {impacts.length ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="text-[13px] font-semibold text-ink-3">Подорожание задело блюда</p>
            <ul className="mt-1 flex flex-col gap-1 text-[15px] text-ink">
              {impacts.map((x) => (
                <li key={x.dish}>
                  {x.dish}: <span className="num text-danger">+{money(x.delta)}</span> на порцию
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <button type="button" onClick={reset} className="btn btn-soft btn-sm mt-5">
          Внести ещё одну
        </button>
      </div>
    );
  }

  if (step === "photo") {
    return (
      <div className="rounded-tile-r bg-tile p-5">
        <h2 className="text-[24px]">Новая накладная</h2>
        {ai ? (
          <>
            <p className="mt-2 text-[15px] text-ink-2">Сфотографируйте накладную целиком. Строки заполнятся сами, вы проверите и сохраните.</p>
            <form action={read} className="mt-4 flex flex-col gap-4">
              <input type="hidden" name="token" value={token} />
              <label htmlFor="inv-photo" className="sr-only">
                Фото накладной
              </label>
              <ImageInput name="photo" id="inv-photo" required />
              <FormError error={error ?? undefined} />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Читаю накладную…">
                  Распознать
                </SubmitButton>
                <button type="button" onClick={manual} className="link-quiet tap text-[14px]">
                  Ввести вручную
                </button>
              </div>
              <Waiting text="Обычно 5–20 секунд. Можно не уходить со страницы." />
            </form>
          </>
        ) : (
          <>
            <p className="mt-2 text-[15px] text-ink-2">Распознавание по фото не подключено. Введите строки вручную — проверка сумм и цен работает и так.</p>
            <button type="button" onClick={manual} className="btn btn-primary btn-sm mt-4">
              Ввести накладную
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <form action={save} className="sheet-in flex flex-col gap-5 rounded-tile-r bg-tile p-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <h2 className="text-[24px]">Проверьте строки</h2>
        {note ? <p className="mt-2 text-[15px] text-ink-2">{note}</p> : null}
        {file ? <p className="mt-2 text-[14px] text-ink-3">Сверьте с фото: ИИ мог ошибиться в цифрах.</p> : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor="inv-sup" className="label">
            Поставщик
          </label>
          <select id="inv-sup" className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            <option value="">Другой</option>
          </select>
          {supplierId ? null : (
            <input aria-label="Название поставщика" className="field" placeholder="Название, как в накладной" maxLength={80} value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="inv-num" className="label">
              Номер
            </label>
            <input id="inv-num" className="field" maxLength={40} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="inv-date" className="label">
              Дата
            </label>
            <input id="inv-date" type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="label mb-3">Строки</legend>
        {lines.map((l, i) => (
          <div key={i} className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex items-center gap-3">
              <input aria-label={`Строка ${i + 1}: товар`} className="field min-w-0 flex-1" placeholder="Товар" maxLength={120} value={l.name} onChange={(e) => set(i, "name", e.target.value)} />
              {lines.length > 1 ? (
                <button type="button" aria-label={`Убрать строку ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="link-quiet tap shrink-0 text-[14px]">
                  Убрать
                </button>
              ) : null}
            </div>
            <div className="grid grid-cols-[1fr_0.8fr_1fr_1.2fr] gap-2">
              {(
                [
                  ["qty", "Кол-во", "decimal"],
                  ["unit", "Ед.", "text"],
                  ["price", "Цена", "decimal"],
                  ["sum", "Сумма", "decimal"],
                ] as const
              ).map(([k, label, mode]) => (
                <label key={k} className="flex min-w-0 flex-col gap-1">
                  <span className="text-[12px] text-ink-3">{label}</span>
                  <input
                    className="field min-w-0 px-2 num"
                    inputMode={mode}
                    maxLength={k === "unit" ? 12 : 16}
                    placeholder={k === "sum" && num(l.qty) != null && num(l.price) != null ? show(Math.round((num(l.qty) ?? 0) * (num(l.price) ?? 0))) : undefined}
                    value={l[k]}
                    onChange={(e) => set(i, k, e.target.value)}
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="btn btn-soft btn-sm self-start">
          Добавить строку
        </button>
      </fieldset>

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="inv-total" className="label">
            Итог по накладной, ₸
          </label>
          <input id="inv-total" className="field num w-40" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
        </div>
        <p className="text-[14px] text-ink-3">
          Сумма строк: <span className="num text-ink">{money(linesTotal)}</span>
        </p>
      </div>

      <FormError error={error ?? undefined} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Проверяю…">
          Сохранить и проверить
        </SubmitButton>
        <button type="button" onClick={reset} className="link-quiet tap text-[14px]">
          Отмена
        </button>
      </div>
    </form>
  );
}

type CountRow = { name: string; count: string; unit: string; sure: boolean; on: boolean };

/** Recount by photo: Claude counts the shelf, the manager corrects and records. */
export function ShelfCount({ token }: { token: string }) {
  const [rows, setRows] = useState<CountRow[] | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function count(fd: FormData) {
    setError(null);
    setSaved(false);
    const r = await countShelf(fd);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setRows(r.count.items.map((x) => ({ name: x.name, count: show(x.count), unit: x.unit, sure: x.sure, on: true })));
    setNote(r.count.note || (r.count.items.length ? "" : "На фото не нашлось товара."));
  }

  async function record(fd: FormData) {
    if (!rows) return;
    fd.set("counts", JSON.stringify(rows.filter((r) => r.on).map((r) => ({ name: r.name, count: num(r.count), unit: r.unit }))));
    const r = await setCounts({}, fd);
    if (r.error) {
      setError(r.error);
      return;
    }
    setRows(null);
    setNote("");
    setSaved(true);
  }

  if (rows) {
    return (
      <form action={record} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        {note ? <p className="text-[15px] text-ink-2">{note}</p> : null}
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                className="check"
                aria-label={`Записать: ${r.name}`}
                checked={r.on}
                onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
              />
              <span className="min-w-0 flex-1 text-[15px] text-ink">
                {r.name}
                {r.sure ? null : <span className="ml-2 text-[13px] text-danger">проверьте</span>}
              </span>
              <input
                aria-label={`${r.name}: сколько`}
                className="field num w-20 px-2"
                inputMode="decimal"
                value={r.count}
                onChange={(e) => setRows((rs) => rs!.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))}
              />
              <span className="w-12 text-[14px] text-ink-3">{r.unit}</span>
            </li>
          ))}
        </ul>
        <FormError error={error ?? undefined} />
        <div className="flex flex-wrap items-center gap-4">
          <SubmitButton className="btn btn-primary btn-sm" disabled={!rows.some((r) => r.on)}>
            Записать остатки
          </SubmitButton>
          <button type="button" onClick={() => setRows(null)} className="link-quiet tap text-[14px]">
            Отмена
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={count} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <p className="text-[15px] text-ink-2">Снимите полку, холодильник или склад. ИИ посчитает, вы поправите и запишете. Прежние остатки этих позиций заменятся.</p>
      <label htmlFor="shelf-photo" className="sr-only">
        Фото полки
      </label>
      <ImageInput name="photo" id="shelf-photo" required />
      <FormError error={error ?? undefined} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Считаю…">
          Посчитать
        </SubmitButton>
        <Waiting text="Обычно 5–20 секунд." />
        {saved ? (
          <span role="status" className="text-[14px] text-success">
            Остатки записаны
          </span>
        ) : null}
      </div>
    </form>
  );
}

type StockOption = { id: string; name: string; unit: string | null; price: number | null };
type DishRow = { stock_item_id: string; qty: string };

/**
 * A dish: name, price in the menu, one portion from the stock. The cost and
 * the share of the menu price update as the cook types. «Подсказать состав»
 * asks Claude for a draft from the venue's own stock list (19 Nov 2026).
 */
export function DishForm({
  token,
  stock,
  ai,
  dish,
}: {
  token: string;
  stock: StockOption[];
  ai: boolean;
  dish?: { id: string; name: string; menu_price: number | null; items: { stock_item_id: string; qty: number }[] };
}) {
  const blank = (): DishRow => ({ stock_item_id: "", qty: "" });
  const [name, setName] = useState(dish?.name ?? "");
  const [price, setPrice] = useState(show(dish?.menu_price ?? null));
  const [rows, setRows] = useState<DishRow[]>(dish ? dish.items.map((i) => ({ stock_item_id: i.stock_item_id, qty: show(i.qty) })) : [blank()]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [thinking, setThinking] = useState(false);

  const costOf = (r: DishRow) => {
    const s = stock.find((x) => x.id === r.stock_item_id);
    const q = num(r.qty);
    return s?.price != null && q != null ? s.price * q : null;
  };
  const cost = rows.reduce((sum, r) => sum + (costOf(r) ?? 0), 0);
  const menu = num(price);
  const set = (i: number, k: keyof DishRow, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  async function suggest() {
    setError(null);
    setNote("");
    setThinking(true);
    const fd = new FormData();
    fd.set("token", token);
    fd.set("name", name);
    const r = await suggestDish(fd);
    setThinking(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.items.length) setRows(r.items.map((i) => ({ stock_item_id: i.stock_item_id, qty: show(i.qty) })));
    setNote(r.note ? `${r.note} Граммовки — черновик: проверьте по техкарте.` : "Граммовки — черновик: проверьте по техкарте.");
  }

  async function save(fd: FormData) {
    setError(null);
    setSaved(false);
    fd.set("items", JSON.stringify(rows.filter((r) => r.stock_item_id).map((r) => ({ stock_item_id: r.stock_item_id, qty: num(r.qty) }))));
    const r = await saveDish(fd);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setSaved(true);
    if (!dish) {
      setName("");
      setPrice("");
      setRows([blank()]);
      setNote("");
    }
  }

  const id = dish?.id ?? "new";
  return (
    <form action={save} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      {dish ? <input type="hidden" name="id" value={dish.id} /> : null}
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <label className="flex min-w-0 flex-col gap-2">
          <span className="label">Блюдо</span>
          <input name="name" className="field min-w-0" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} placeholder="Шакшука" />
        </label>
        <label className="flex min-w-0 flex-col gap-2">
          <span className="label">В меню, ₸</span>
          <input name="menu_price" className="field num min-w-0" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label mb-2 flex w-full items-center justify-between gap-3">
          <span>На одну порцию</span>
          {ai ? (
            <button type="button" onClick={suggest} disabled={thinking || !name.trim()} className="link-quiet tap text-[14px] font-normal disabled:opacity-50">
              {thinking ? "Думаю…" : "Подсказать состав"}
            </button>
          ) : null}
        </legend>
        {note ? <p className="text-[14px] text-ink-3">{note}</p> : null}
        {rows.map((r, i) => {
          const s = stock.find((x) => x.id === r.stock_item_id);
          const c = costOf(r);
          return (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_5.5rem] items-end gap-2 border-t border-line pt-3">
              <select aria-label={`Продукт ${i + 1}`} className="field min-w-0" value={r.stock_item_id} onChange={(e) => set(i, "stock_item_id", e.target.value)}>
                <option value="">Продукт со склада</option>
                {stock.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </select>
              <label className="flex min-w-0 flex-col gap-1">
                <span className="text-[12px] text-ink-3">{s?.unit ? `Сколько, ${s.unit}` : "Сколько"}</span>
                <input aria-label={`Продукт ${i + 1}: сколько`} className="field num min-w-0 px-2" inputMode="decimal" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
              </label>
              <div className="col-span-2 flex items-center justify-between text-[13px] text-ink-3">
                <span>{c != null ? money(c) : s && s.price == null ? "у продукта ещё нет цены" : ""}</span>
                {rows.length > 1 ? (
                  <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} className="link-quiet tap text-[13px]">
                    Убрать
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="link-quiet tap self-start text-[14px]">
          Добавить продукт
        </button>
      </fieldset>

      <p className="border-t border-line pt-4 text-[15px] text-ink-2">
        Себестоимость <span className="num text-ink">{money(cost)}</span>
        {menu ? (
          <>
            {" "}
            · <span className="num text-ink">{Math.round((cost / menu) * 100)}%</span> от цены в меню
          </>
        ) : null}
      </p>

      <FormError error={error ?? undefined} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn btn-primary btn-sm">{dish ? "Сохранить" : "Добавить блюдо"}</SubmitButton>
        {saved ? (
          <span role="status" id={`dish-ok-${id}`} className="text-[14px] text-success">
            Сохранено
          </span>
        ) : null}
      </div>
    </form>
  );
}
