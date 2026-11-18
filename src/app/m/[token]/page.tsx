import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { almatyToday, formatDay, formatMoney, formatPhone, shiftDate } from "@/lib/format";
import { loadInvoices, loadStock, loadSuppliers, managerVenue, orderDraft, whatsappLink, type StockItem, type Supplier } from "@/lib/backoffice";
import { aiAvailable } from "@/lib/planDraft";
import { servedByApp } from "@/lib/storage";
import { Mark } from "@/components/Logo";
import { ActionForm, ButtonForm, CopyButton } from "@/app/admin/_ui";
import { deleteInvoice, deleteStockItem, deleteSupplier, saveStockItem, saveSupplier } from "./actions";
import { InvoiceNew, Panel, ShelfCount, Toggle } from "./ManagerClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Управляющему", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ tab?: string }> };

const TABS = [
  { id: "invoices", label: "Накладные" },
  { id: "stock", label: "Склад" },
  { id: "order", label: "Заказ" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const qty = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");
const isLow = (s: StockItem) => s.min_qty != null && s.on_hand <= s.min_qty;

/**
 * The venue's back office (18 Nov 2026, after Marble: invoices, stock,
 * supplier orders). Russian only, like the admin: it is a work tool for the
 * manager, not a page for guests.
 */
export default async function ManagerPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { tab: rawTab } = await searchParams;
  const venue = await managerVenue(token);

  if (!venue) {
    return (
      <main lang="ru" className="px-edge flex min-h-dvh flex-col items-start justify-center gap-5">
        <h1 className="text-[34px]">Ссылка не работает</h1>
        <p className="text-ink-2">Её могли заменить. Попросите новую у администратора Бөлек.</p>
      </main>
    );
  }

  const tab: Tab = rawTab === "stock" || rawTab === "order" ? rawTab : "invoices";
  const [suppliers, invoices, stock] = await Promise.all([loadSuppliers(venue.id), loadInvoices(venue.id), loadStock(venue.id)]);
  const today = almatyToday();
  const monthAgo = shiftDate(today, -30);
  const [month] = await db()<{ count: number; total: string | null }[]>`
    select count(*)::int as count, sum(total) as total from invoices
    where venue_id = ${venue.id} and coalesce(invoice_date, created_at::date) >= ${monthAgo}`;
  const flagged = invoices.filter((i) => i.issues.length && (i.invoice_date ?? today) >= monthAgo).length;
  const low = stock.filter(isLow);
  const groups = orderDraft(venue.name, stock, suppliers, formatDay(shiftDate(today, 1)));
  const photos = servedByApp();

  const figures: { tab: Tab; value: string; label: string; alert: boolean }[] = [
    { tab: "invoices", value: String(month.count), label: `накладных за 30 дней · ${formatMoney(Number(month.total ?? 0))}`, alert: false },
    { tab: "invoices", value: String(flagged), label: "проверить перед оплатой", alert: flagged > 0 },
    { tab: "order", value: String(low.length), label: "позиций пора заказать", alert: low.length > 0 },
  ];

  return (
    <main lang="ru" className="px-edge pb-16">
      <header className="flex h-16 items-center md:h-20">
        <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold text-ink-3">
          <Mark size={20} />
          Управляющему
        </span>
      </header>

      <div className="max-w-[40rem]">
        <h1 className="text-[34px] md:text-[40px]">{venue.name}</h1>
        <p className="mt-2 text-[15px] text-ink-3">Накладные, склад и заказы поставщикам. Ссылка личная: не пересылайте её.</p>

        <ul className="mt-6 grid grid-cols-3 gap-px bg-line">
          {figures.map((f) => (
            <li key={f.label} className="bg-tile">
              <Link href={`/m/${token}?tab=${f.tab}`} className="flex h-full flex-col gap-1.5 p-4">
                <span className={`num text-[30px] leading-none ${f.alert ? "text-danger" : "text-ink"}`}>{f.value}</span>
                <span className="text-[13px] leading-snug text-ink-3">{f.label}</span>
              </Link>
            </li>
          ))}
        </ul>

        <nav aria-label="Разделы" className="mt-6 flex gap-2">
          {TABS.map((x) => (
            <Link
              key={x.id}
              href={x.id === "invoices" ? `/m/${token}` : `/m/${token}?tab=${x.id}`}
              aria-current={x.id === tab ? "page" : undefined}
              className={`btn btn-sm ${x.id === tab ? "bg-ink text-canvas" : "btn-soft"}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>

        {tab === "invoices" ? (
          <div className="mt-8 flex flex-col gap-10">
            <InvoiceNew token={token} suppliers={suppliers} ai={aiAvailable()} today={today} />
            <section aria-labelledby="inv-list">
              <h2 id="inv-list" className="text-[24px]">
                Последние накладные
              </h2>
              {invoices.length === 0 ? (
                <p className="mt-3 text-ink-3">Пока ни одной. Сфотографируйте первую — строки заполнятся сами.</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {invoices.map((i) => (
                    <li key={i.id}>
                      <article className="rounded-tile-r bg-tile p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <p className="text-[17px] text-ink">{i.supplier_name || "Поставщик не указан"}</p>
                            <p className="mt-1 text-[14px] text-ink-3">
                              {[i.invoice_date ? formatDay(i.invoice_date) : null, i.number ? `№ ${i.number}` : null].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <p className="num shrink-0 text-[20px] text-ink">{formatMoney(i.total)}</p>
                        </div>
                        {i.issues.length ? (
                          <ul className="mt-3 flex flex-col gap-1 text-[15px] text-danger">
                            {i.issues.map((x, k) => (
                              <li key={k}>— {x.text}</li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-3 text-[14px] text-success">Суммы и цены сходятся</p>
                        )}
                        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                          <Toggle label={`Строки (${i.lines.length})`}>
                            <ul className="flex flex-col divide-y divide-line text-[14px]">
                              {i.lines.map((l, k) => (
                                <li key={k} className="flex justify-between gap-4 py-2">
                                  <span className="min-w-0 text-ink">{l.name}</span>
                                  <span className="num shrink-0 text-ink-3">
                                    {l.qty != null ? `${qty(l.qty)}${l.unit ? ` ${l.unit}` : ""}` : ""}
                                    {l.price != null ? ` × ${formatMoney(l.price)}` : ""}
                                    {l.sum != null ? ` = ${formatMoney(l.sum)}` : ""}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </Toggle>
                          {i.photo_path && photos ? (
                            <a href={`/m/${token}/file/${i.photo_path}`} target="_blank" rel="noreferrer" className="link-quiet text-[14px]">
                              Фото
                            </a>
                          ) : null}
                          <ButtonForm
                            action={deleteInvoice}
                            fields={{ token, id: i.id }}
                            label="Удалить"
                            confirmText="Удалить накладную? Товар из неё уйдёт со склада."
                          />
                        </div>
                      </article>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === "stock" ? (
          <div className="mt-8 flex flex-col gap-10">
            <div className="flex flex-col gap-3">
              {aiAvailable() ? (
                <Panel title="Пересчитать по фото">
                  <ShelfCount token={token} />
                </Panel>
              ) : null}
              <Panel title="Добавить позицию">
                <StockForm token={token} suppliers={suppliers} />
              </Panel>
            </div>
            <section aria-labelledby="stock-list">
              <h2 id="stock-list" className="text-[24px]">
                На складе
              </h2>
              <p className="mt-2 text-[15px] text-ink-3">Приход из накладных добавляется сам. «Заказать при» — остаток, на котором позиция попадает в заказ.</p>
              {stock.length === 0 ? (
                <p className="mt-3 text-ink-3">Пусто. Позиции появятся из накладных, или добавьте их выше.</p>
              ) : (
                <ul className="mt-4 flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
                  {stock.map((s) => (
                    <li key={s.id} className="py-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <p className="min-w-0 text-[16px] text-ink">
                          {s.name}
                          {isLow(s) ? <span className="ml-2 text-[13px] font-medium text-danger"> пора заказать</span> : null}
                        </p>
                        <p className={`num shrink-0 text-[18px] ${isLow(s) ? "text-danger" : "text-ink"}`}>
                          {qty(s.on_hand)}
                          {s.unit ? <span className="text-[14px] text-ink-3"> {s.unit}</span> : null}
                        </p>
                      </div>
                      <p className="mt-1 text-[13px] text-ink-3">
                        {[
                          s.min_qty != null ? `заказать при ${qty(s.min_qty)}` : "точка заказа не задана",
                          s.par_qty != null ? `до ${qty(s.par_qty)}` : null,
                          suppliers.find((x) => x.id === s.supplier_id)?.name ?? null,
                          s.last_price != null ? `${formatMoney(s.last_price)}${s.unit ? ` за ${s.unit}` : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <div className="mt-2">
                        <Toggle label="Изменить">
                          <StockForm token={token} suppliers={suppliers} item={s} />
                          <div className="mt-3">
                            <ButtonForm action={deleteStockItem} fields={{ token, id: s.id }} label="Удалить позицию" confirmText={`Удалить «${s.name}» со склада?`} />
                          </div>
                        </Toggle>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {tab === "order" ? (
          <div className="mt-8 flex flex-col gap-10">
            <section aria-labelledby="order-list">
              <h2 id="order-list" className="text-[24px]">
                Заказ на {formatDay(shiftDate(today, 1))}
              </h2>
              <p className="mt-2 text-[15px] text-ink-3">
                Здесь всё, что дошло до точки заказа, с количеством до нормы. Откройте WhatsApp поставщика — текст уже набран, отправляете вы.
              </p>
              {groups.length === 0 ? (
                <p className="mt-4 text-ink-2">Заказывать нечего: всего хватает. Точку заказа задают на вкладке «Склад».</p>
              ) : (
                <ul className="mt-4 flex flex-col gap-3">
                  {groups.map((g) => {
                    const wa = whatsappLink(g.supplier?.phone ?? null, g.text);
                    return (
                      <li key={g.supplier?.id ?? "none"} className="rounded-tile-r bg-tile p-5">
                        <p className="text-[17px] font-medium text-ink">{g.supplier?.name ?? "Без поставщика"}</p>
                        {g.supplier?.notes ? <p className="mt-1 text-[14px] text-ink-3">{g.supplier.notes}</p> : null}
                        <p className="mt-3 whitespace-pre-line bg-raised px-4 py-3 text-[15px] text-ink">{g.text}</p>
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {wa ? (
                            <a href={wa} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                              Открыть в WhatsApp
                            </a>
                          ) : null}
                          <CopyButton text={g.text} label="Скопировать текст" />
                        </div>
                        {g.supplier ? null : <p className="mt-3 text-[13px] text-ink-3">Укажите поставщика у этих позиций на вкладке «Склад» — заказ разойдётся по ним сам.</p>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="sup-list" className="flex flex-col gap-3">
              <h2 id="sup-list" className="text-[24px]">
                Поставщики
              </h2>
              {suppliers.length ? (
                <ul className="flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
                  {suppliers.map((s) => (
                    <li key={s.id} className="flex items-start justify-between gap-4 py-4">
                      <div className="min-w-0">
                        <p className="text-[16px] text-ink">{s.name}</p>
                        <p className="mt-1 text-[13px] text-ink-3">{[s.phone ? formatPhone(s.phone) : "без телефона", s.notes].filter(Boolean).join(" · ")}</p>
                      </div>
                      <ButtonForm action={deleteSupplier} fields={{ token, id: s.id }} label="Удалить" confirmText={`Удалить поставщика «${s.name}»? Его накладные останутся.`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-3">Пока никого. Добавьте поставщика с номером WhatsApp — заказ уйдёт ему в один шаг.</p>
              )}
              <Panel title="Добавить поставщика">
                <ActionForm action={saveSupplier} submit="Добавить">
                  <input type="hidden" name="token" value={token} />
                  <Input name="name" label="Название" required max={80} />
                  <Input name="phone" label="WhatsApp" type="tel" placeholder="+7 7__ ___ __ __" max={40} />
                  <Input name="notes" label="Заметка" placeholder="Привоз вт и пт до 10:00" max={300} />
                </ActionForm>
              </Panel>
            </section>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function Input({
  name,
  label,
  type = "text",
  required,
  max,
  placeholder,
  value,
  decimal,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  max?: number;
  placeholder?: string;
  value?: string | number | null;
  decimal?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-2">
      <span className="label">{label}</span>
      <input
        name={name}
        type={type}
        className={`field min-w-0 ${decimal ? "num" : ""}`}
        required={required}
        maxLength={max}
        placeholder={placeholder}
        inputMode={decimal ? "decimal" : undefined}
        defaultValue={value == null ? undefined : typeof value === "number" ? qty(value) : value}
      />
    </label>
  );
}

function StockForm({ token, suppliers, item }: { token: string; suppliers: Supplier[]; item?: StockItem }) {
  return (
    <ActionForm action={saveStockItem} submit={item ? "Сохранить" : "Добавить"}>
      <input type="hidden" name="token" value={token} />
      {item ? <input type="hidden" name="id" value={item.id} /> : null}
      <div className="grid grid-cols-[2fr_1fr] gap-3">
        <Input name="name" label="Название" required max={120} value={item?.name} />
        <Input name="unit" label="Ед." placeholder="кг" max={12} value={item?.unit} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Input name="on_hand" label="Есть" decimal value={item?.on_hand ?? null} />
        <Input name="min_qty" label="Заказать при" decimal value={item?.min_qty ?? null} />
        <Input name="par_qty" label="Заказать до" decimal value={item?.par_qty ?? null} />
      </div>
      <label className="flex flex-col gap-2">
        <span className="label">Поставщик</span>
        <select name="supplier_id" className="field" defaultValue={item?.supplier_id ?? ""}>
          <option value="">Не указан</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
    </ActionForm>
  );
}
