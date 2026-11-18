"use client";

import { useState, type ReactNode } from "react";
import { countShelf, readInvoice, saveInvoice, setCounts } from "./actions";
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

/** «Изменить» under a row: the form appears in place. */
export function Toggle({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="link-quiet text-[14px]">
        {open ? "Свернуть" : label}
      </button>
      {open ? <div className="sheet-in mt-4">{children}</div> : null}
    </div>
  );
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
    setStep("done");
  }

  const set = (i: number, k: keyof Line, v: string) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const linesTotal = lines.reduce((s, l) => s + (num(l.sum) ?? ((num(l.qty) ?? 0) * (num(l.price) ?? 0))), 0);

  if (step === "done") {
    return (
      <div role="status" className="sheet-in rounded-tile-r bg-tile p-5">
        {issues.length ? (
          <>
            <p className="text-[17px] font-medium text-danger">Проверьте перед оплатой</p>
            <ul className="mt-3 flex flex-col gap-2 text-[15px] text-ink">
              {issues.map((x, i) => (
                <li key={i}>— {x.text}</li>
              ))}
            </ul>
            <p className="mt-3 text-[14px] text-ink-3">Накладная сохранена, товар добавлен на склад.</p>
          </>
        ) : (
          <p className="text-[17px] text-ink">
            <span className="font-medium text-success">Всё сходится.</span> Накладная сохранена, товар добавлен на склад.
          </p>
        )}
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
              <div className="flex flex-wrap items-center gap-4">
                <SubmitButton className="btn btn-primary btn-sm" pendingLabel="Читаю накладную…">
                  Распознать
                </SubmitButton>
                <button type="button" onClick={manual} className="link-quiet text-[14px]">
                  Ввести вручную
                </button>
              </div>
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
                <button type="button" aria-label={`Убрать строку ${i + 1}`} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="link-quiet shrink-0 text-[14px]">
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
        <button type="button" onClick={reset} className="link-quiet text-[14px]">
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
          <button type="button" onClick={() => setRows(null)} className="link-quiet text-[14px]">
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
        {saved ? (
          <span role="status" className="text-[14px] text-success">
            Остатки записаны
          </span>
        ) : null}
      </div>
    </form>
  );
}
