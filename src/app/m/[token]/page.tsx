import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { almatyToday, formatDay, formatMoney, formatPhone, pluralRu, shiftDate } from "@/lib/format";
import {
  amount,
  itemKey,
  loadDishes,
  loadInvoices,
  loadOpenOrders,
  loadStock,
  loadSuppliers,
  loadWriteOffs,
  managerVenue,
  orderDraft,
  qtyText,
  unitWord,
  whatsappLink,
  WRITE_OFF_REASONS,
  type Dish,
  type StockItem,
  type Supplier,
} from "@/lib/backoffice";
import { aiAvailable } from "@/lib/planDraft";
import { servedByApp } from "@/lib/storage";
import { Mark } from "@/components/Logo";
import { ActionForm, ButtonForm } from "@/app/admin/_ui";
import { cancelOrder, deleteDish, deleteInvoice, deleteStockItem, deleteSupplier, deleteWriteOff, saveStockItem, saveSupplier, setPaid, writeOff } from "./actions";
import { DishForm, InvoiceNew, Panel, SendOrder, ShelfCount, Toggle } from "./ManagerClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Управляющему",
  robots: { index: false, follow: false },
};

type Props = {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ tab?: string }>;
};

const TABS = [
  { id: "invoices", label: "Накладные" },
  { id: "stock", label: "Склад" },
  { id: "order", label: "Заказ" },
  { id: "dishes", label: "Блюда" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const isLow = (s: StockItem) => s.min_qty != null && s.on_hand <= s.min_qty;
const QUIET = "link-quiet tap text-[14px]";

/**
 * The venue's back office (18 Nov 2026, after Marble: invoices, stock,
 * supplier orders; 19 Nov: orders checked on delivery, payments,
 * write-offs, dishes). Russian only, like the admin: a work tool for the
 * manager, not a page for guests.
 *
 * Layout (design critique, 19 Nov 2026, owner: «полишни дизайн»): on a
 * phone the tab's one action comes first, the list after; from 1024px the
 * list is the main column and the action stays beside it. Tabs are
 * underlined words, not filled blocks: the cream fill belongs to the one
 * primary button of a block, and the tab used to compete with it.
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

  const tab: Tab = TABS.some((t) => t.id === rawTab) ? (rawTab as Tab) : "invoices";
  const sql = db();
  const today = almatyToday();
  const [suppliers, stock, open, [due], [flagged]] = await Promise.all([
    loadSuppliers(venue.id),
    loadStock(venue.id),
    loadOpenOrders(venue.id),
    sql<{ count: number; total: string | null }[]>`select count(*)::int as count, sum(total) as total from invoices where venue_id = ${venue.id} and paid_at is null`,
    sql<{ count: number }[]>`select count(*)::int as count from invoices where venue_id = ${venue.id} and paid_at is null and jsonb_array_length(issues) > 0`,
  ]);
  const onTheWay = new Set(open.flatMap((o) => o.lines.map((l) => l.key)));
  const toOrder = stock.filter((s) => isLow(s) && !onTheWay.has(itemKey(s.name)));
  const ai = aiAvailable();

  const figures = [
    {
      tab: "invoices",
      label: "К оплате",
      value: formatMoney(Number(due.total ?? 0)),
      note: due.count ? `${due.count} ${pluralRu(due.count, ["накладная", "накладные", "накладных"])}` : "всё оплачено",
      alert: false,
      wide: true,
    },
    {
      tab: "invoices",
      label: "Проверить",
      value: String(flagged.count),
      note: flagged.count ? pluralRu(flagged.count, ["накладная с расхождением", "накладные с расхождениями", "накладных с расхождениями"]) : "расхождений нет",
      alert: flagged.count > 0,
      wide: false,
    },
    {
      tab: "order",
      label: "Заказать",
      value: String(toOrder.length),
      note: toOrder.length
        ? pluralRu(toOrder.length, ["позиция на исходе", "позиции на исходе", "позиций на исходе"])
        : open.length
          ? `в пути: ${open.length} ${pluralRu(open.length, ["заказ", "заказа", "заказов"])}`
          : "всего хватает",
      alert: toOrder.length > 0,
      wide: false,
    },
  ];

  // mainFirst: on a phone the list comes before the side column (the order
  // tab's list is its action; elsewhere the action is in the side column).
  let body: { main: ReactNode; side: ReactNode; mainFirst?: boolean };
  if (tab === "invoices") body = await invoicesTab(venue.id, token, suppliers, ai, today);
  else if (tab === "stock") body = await stockTab(venue.id, token, stock, suppliers, onTheWay, ai);
  else if (tab === "order") body = orderTab(venue.name, token, stock, suppliers, open, onTheWay, today);
  else body = await dishesTab(venue.id, token, stock, ai);

  return (
    <main lang="ru" className="px-edge pb-20">
      <header className="flex h-16 items-center md:h-20">
        <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold text-ink-3">
          <Mark size={20} />
          Управляющему
        </span>
      </header>

      <h1 className="text-[34px] md:text-[40px]">{venue.name}</h1>
      <p className="mt-2 max-w-[40rem] text-[15px] text-ink-3">Накладные, склад, заказы и себестоимость блюд. Ссылка личная: не пересылайте её.</p>

      <ul className="mt-6 grid grid-cols-2 gap-px bg-line sm:grid-cols-3">
        {figures.map((f) => (
          <li key={f.label} className={`bg-tile ${f.wide ? "col-span-2 sm:col-span-1" : ""}`}>
            <Link href={`/m/${token}${f.tab === "invoices" ? "" : `?tab=${f.tab}`}`} className="flex h-full flex-col gap-2 p-4 md:p-5">
              <span className="text-[13px] font-semibold text-ink-3">{f.label}</span>
              <span className={`num text-[28px] leading-none md:text-[32px] ${f.alert ? "text-danger" : "text-ink"}`}>{f.value}</span>
              <span className="text-[13px] leading-snug text-ink-3">{f.note}</span>
            </Link>
          </li>
        ))}
      </ul>

      <nav aria-label="Разделы" className="mt-8 flex gap-6 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {TABS.map((x) => (
          <Link
            key={x.id}
            href={x.id === "invoices" ? `/m/${token}` : `/m/${token}?tab=${x.id}`}
            aria-current={x.id === tab ? "page" : undefined}
            className={`tap -mb-px shrink-0 border-b-2 text-[15px] font-medium transition-colors duration-150 ${x.id === tab ? "border-accent text-ink" : "border-transparent text-ink-3 hover:text-ink"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <div className="mt-8 flex flex-col gap-10 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-12">
        <aside className={`flex flex-col gap-3 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 ${body.mainFirst ? "order-2" : ""}`}>{body.side}</aside>
        <div className={`min-w-0 lg:col-start-1 lg:row-start-1 ${body.mainFirst ? "order-1" : ""}`}>{body.main}</div>
      </div>
    </main>
  );
}

// ── Накладные ────────────────────────────────────────────────────────────

async function invoicesTab(venueId: string, token: string, suppliers: Supplier[], ai: boolean, today: string) {
  const invoices = await loadInvoices(venueId);
  const photos = servedByApp();
  return {
    side: <InvoiceNew token={token} suppliers={suppliers} ai={ai} today={today} />,
    main: (
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
                        {[
                          i.invoice_date ? formatDay(i.invoice_date) : null,
                          i.number ? `№ ${i.number}` : null,
                          i.paid_on ? `оплачена ${formatDay(i.paid_on)}` : "не оплачена",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <p className="num shrink-0 text-[20px] text-ink">{formatMoney(i.total)}</p>
                  </div>
                  {i.issues.length ? (
                    <div className="mt-4 border-l-2 border-danger pl-4">
                      <p className="text-[13px] font-semibold text-danger">{i.paid_on ? "Было при приёмке" : "Проверьте перед оплатой"}</p>
                      <ul className="mt-1 flex flex-col gap-1 text-[15px] text-ink-2">
                        {i.issues.map((x, k) => (
                          <li key={k}>{x.text}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="mt-3 text-[14px] text-success">Суммы и цены сходятся</p>
                  )}
                  <Toggle
                    label={`Строки (${i.lines.length})`}
                    end={
                      i.paid_on ? null : <ButtonForm action={setPaid} fields={{ token, id: i.id, paid: "1" }} label="Отметить оплату" className="btn btn-soft btn-sm" />
                    }
                  >
                    <ul className="flex flex-col divide-y divide-line text-[14px]">
                      {i.lines.map((l, k) => (
                        <li key={k} className="flex justify-between gap-4 py-2">
                          <span className="min-w-0 text-ink">{l.name}</span>
                          <span className="num shrink-0 text-ink-3">
                            {l.qty != null ? amount(l.qty, l.unit) : ""}
                            {l.price != null ? ` × ${formatMoney(l.price)}` : ""}
                            {l.sum != null ? ` = ${formatMoney(l.sum)}` : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex flex-wrap items-center gap-x-5">
                      {i.photo_path && photos ? (
                        <a href={`/m/${token}/file/${i.photo_path}`} target="_blank" rel="noreferrer" className={QUIET}>
                          Фото накладной
                        </a>
                      ) : null}
                      {i.paid_on ? <ButtonForm action={setPaid} fields={{ token, id: i.id, paid: "0" }} label="Снять отметку об оплате" className={QUIET} /> : null}
                      <ButtonForm
                        action={deleteInvoice}
                        fields={{ token, id: i.id }}
                        label="Удалить накладную"
                        confirmText="Удалить накладную? Товар из неё уйдёт со склада."
                        className={QUIET}
                      />
                    </div>
                  </Toggle>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    ),
  };
}

// ── Склад ────────────────────────────────────────────────────────────────

/** How full the shelf is against «до»; the notch marks «заказать при». */
function Level({ s }: { s: StockItem }) {
  const top = Math.max(s.par_qty ?? 0, (s.min_qty ?? 0) * 2, s.on_hand, 0.0001);
  const fill = Math.min(1, s.on_hand / top);
  return (
    <div aria-hidden="true" className="relative mt-3 h-1 bg-raised">
      <div className={`absolute inset-y-0 left-0 ${isLow(s) ? "bg-danger" : "bg-ink-3"}`} style={{ width: `${fill * 100}%` }} />
      {s.min_qty != null ? <div className="absolute -top-1 h-3 w-px bg-ink-2" style={{ left: `${Math.min(1, s.min_qty / top) * 100}%` }} /> : null}
    </div>
  );
}

async function stockTab(venueId: string, token: string, stock: StockItem[], suppliers: Supplier[], onTheWay: Set<string>, ai: boolean) {
  const writeOffs = await loadWriteOffs(venueId);
  const lost = writeOffs.reduce((s, w) => s + (w.cost ?? 0), 0);
  // What needs a decision first: low items by how low, then the rest by name.
  const ratio = (s: StockItem) => (s.min_qty ? s.on_hand / s.min_qty : Infinity);
  const sorted = [...stock].sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || (isLow(a) ? ratio(a) - ratio(b) : 0) || a.name.localeCompare(b.name, "ru"));
  // History, not an action: beside the list on a computer, under it on a phone.
  const lostBlock = (id: string) => (
    <section aria-labelledby={id} className="rounded-tile-r bg-tile p-5">
      <h2 id={id} className="text-[20px]">
        Списано за 30 дней
      </h2>
      <p className="num mt-2 text-[28px] leading-none text-ink">{formatMoney(lost)}</p>
      {writeOffs.length ? (
        <ul className="mt-4 flex flex-col divide-y divide-line">
          {writeOffs.map((w) => (
            <li key={w.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="text-[15px] text-ink">
                  {w.name} · {amount(w.qty, w.unit)}
                </p>
                <p className="mt-0.5 text-[13px] text-ink-3">
                  {[formatDay(w.day), WRITE_OFF_REASONS[w.reason], w.cost != null ? formatMoney(w.cost) : null, w.note].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ButtonForm
                action={deleteWriteOff}
                fields={{ token, id: w.id }}
                label="Вернуть"
                confirmText={`Вернуть «${w.name}» на склад?`}
                className={`${QUIET} -my-2 shrink-0`}
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[14px] text-ink-3">Ничего. Списать можно у любой позиции: «Изменить или списать».</p>
      )}
    </section>
  );
  return {
    side: (
      <>
        {ai ? (
          <Panel title="Пересчитать по фото">
            <ShelfCount token={token} />
          </Panel>
        ) : null}
        <Panel title="Добавить позицию">
          <StockForm token={token} suppliers={suppliers} />
        </Panel>
        <div className="hidden lg:block">{lostBlock("wo-side")}</div>
      </>
    ),
    main: (
      <section aria-labelledby="stock-list">
        <h2 id="stock-list" className="text-[24px]">
          На складе
        </h2>
        <p className="mt-2 max-w-[40rem] text-[15px] text-ink-3">
          Приход из накладных добавляется сам. Черта на полосе — «заказать при»: ниже неё позиция попадает в заказ.
        </p>
        {stock.length === 0 ? (
          <p className="mt-3 text-ink-3">Пусто. Позиции появятся из накладных, или добавьте их.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
            {sorted.map((s) => {
              const sup = suppliers.find((x) => x.id === s.supplier_id)?.name;
              const status = isLow(s) ? (onTheWay.has(itemKey(s.name)) ? "в пути" : "пора заказать") : null;
              return (
                <li key={s.id} className="py-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="min-w-0 text-[16px] text-ink">{s.name}</p>
                    <p className={`num shrink-0 text-[18px] ${isLow(s) ? "text-danger" : "text-ink"}`}>
                      {qtyText(s.on_hand)}
                      {s.unit ? <span className="text-[14px] text-ink-3"> {unitWord(s.on_hand, s.unit)}</span> : null}
                    </p>
                  </div>
                  <Level s={s} />
                  <Toggle
                    label="Изменить или списать"
                    start={
                      <p className="mt-2 text-[13px] text-ink-3 sm:mt-0">
                        {status ? (
                          <span className={`font-semibold ${status === "в пути" ? "text-ink-2" : "text-danger"}`}>{status[0].toUpperCase() + status.slice(1)} · </span>
                        ) : null}
                        {[
                          s.min_qty != null ? `заказ при ${qtyText(s.min_qty)}${s.par_qty != null ? `, до ${qtyText(s.par_qty)}` : ""}` : "точка заказа не задана",
                          sup ?? null,
                          s.last_price != null ? `${formatMoney(s.last_price)}${s.unit ? ` за ${s.unit}` : ""}` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    }
                  >
                    <div className="flex flex-col gap-6">
                      <ActionForm action={writeOff} submit="Списать" className="flex flex-col gap-4">
                        <input type="hidden" name="token" value={token} />
                        <input type="hidden" name="id" value={s.id} />
                        <p className="text-[15px] font-medium text-ink">Списать</p>
                        <div className="grid grid-cols-[1fr_1.4fr] gap-3">
                          <Input name="qty" label={`Сколько${s.unit ? `, ${s.unit}` : ""}`} decimal required />
                          <label className="flex min-w-0 flex-col gap-2">
                            <span className="label">Причина</span>
                            <select name="reason" className="field min-w-0" defaultValue="spoiled">
                              {Object.entries(WRITE_OFF_REASONS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </label>
                        </div>
                        <Input name="note" label="Заметка" placeholder="Необязательно" max={200} />
                      </ActionForm>
                      <div className="border-t border-line pt-5">
                        <p className="mb-4 text-[15px] font-medium text-ink">Изменить</p>
                        <StockForm token={token} suppliers={suppliers} item={s} />
                        <ButtonForm
                          action={deleteStockItem}
                          fields={{ token, id: s.id }}
                          label="Удалить позицию"
                          confirmText={`Удалить «${s.name}» со склада?`}
                          className={`${QUIET} mt-2`}
                        />
                      </div>
                    </div>
                  </Toggle>
                </li>
              );
            })}
          </ul>
        )}
        <div className="mt-10 lg:hidden">{lostBlock("wo-main")}</div>
      </section>
    ),
  };
}

// ── Заказ ────────────────────────────────────────────────────────────────

function orderTab(
  venueName: string,
  token: string,
  stock: StockItem[],
  suppliers: Supplier[],
  open: Awaited<ReturnType<typeof loadOpenOrders>>,
  onTheWay: Set<string>,
  today: string,
) {
  const day = formatDay(shiftDate(today, 1));
  const groups = orderDraft(venueName, stock, suppliers, day, onTheWay);
  const sentAt = (iso: string) =>
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: "Asia/Almaty",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  const sentDay = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date(iso));
  return {
    mainFirst: true,
    side: (
      <section aria-labelledby="sup-list" className="flex flex-col gap-3">
        <h2 id="sup-list" className="text-[20px]">
          Поставщики
        </h2>
        {suppliers.length ? (
          <ul className="flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
            {suppliers.map((s) => (
              <li key={s.id} className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="text-[16px] text-ink">{s.name}</p>
                  <p className="mt-1 text-[13px] text-ink-3">{[s.phone ? formatPhone(s.phone) : "без WhatsApp", s.notes].filter(Boolean).join(" · ")}</p>
                </div>
                <ButtonForm
                  action={deleteSupplier}
                  fields={{ token, id: s.id }}
                  label="Удалить"
                  confirmText={`Удалить поставщика «${s.name}»? Его накладные останутся.`}
                  className={`${QUIET} -my-2 shrink-0`}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-3">Пока никого. Добавьте поставщика с номером WhatsApp — заказ уйдёт ему в одно касание.</p>
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
    ),
    main: (
      <div className="flex flex-col gap-10">
        <section aria-labelledby="order-list">
          <h2 id="order-list" className="text-[24px]">
            Заказ на {day}
          </h2>
          <p className="mt-2 max-w-[40rem] text-[15px] text-ink-3">
            Всё, что опустилось до «заказать при», с количеством до нормы. Текст уже набран: отправляете вы, и заказ встаёт в «В пути» — по нему сверится накладная.
          </p>
          {groups.length === 0 ? (
            <p className="mt-4 text-ink-2">{open.length ? "Всё нужное уже в пути." : "Заказывать нечего: всего хватает."} Точку заказа задают на вкладке «Склад».</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {groups.map((g) => (
                <li key={g.key} className="rounded-tile-r bg-tile p-5">
                  <p className="text-[17px] font-medium text-ink">{g.supplier?.name ?? "Без поставщика"}</p>
                  {g.supplier?.notes ? <p className="mt-1 text-[14px] text-ink-3">{g.supplier.notes}</p> : null}
                  <p className="mt-3 whitespace-pre-line bg-raised px-4 py-3 text-[15px] text-ink">{g.text}</p>
                  <SendOrder token={token} supplierKey={g.key} wa={whatsappLink(g.supplier?.phone ?? null, g.text)} text={g.text} />
                  {g.supplier ? null : <p className="mt-2 text-[13px] text-ink-3">Укажите поставщика у этих позиций на вкладке «Склад» — заказ разойдётся по ним сам.</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {open.length ? (
          <section aria-labelledby="on-way">
            <h2 id="on-way" className="text-[24px]">
              В пути
            </h2>
            <p className="mt-2 max-w-[40rem] text-[15px] text-ink-3">
              Когда придёт накладная от этого поставщика, приложение сверит её с заказом: недовоз, чего не привезли, что не заказывали.
            </p>
            <ul className="mt-4 flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
              {open.map((o) => (
                <li key={o.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="text-[16px] text-ink">{o.supplier_name ?? "Без поставщика"}</p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      Отправлен {formatDay(sentDay(o.created_at))} в {sentAt(o.created_at)} ·{" "}
                      {o.lines.map((l) => `${l.name} ${amount(l.qty, l.unit)}`).join(", ")}
                    </p>
                  </div>
                  <ButtonForm
                    action={cancelOrder}
                    fields={{ token, id: o.id }}
                    label="Отменить"
                    confirmText="Отменить заказ? Позиции снова попадут в заказ."
                    className={`${QUIET} -my-2 shrink-0`}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    ),
  };
}

// ── Блюда ────────────────────────────────────────────────────────────────

async function dishesTab(venueId: string, token: string, stock: StockItem[], ai: boolean) {
  const dishes = await loadDishes(venueId, stock);
  const share = (d: Dish) => (d.menu_price ? d.cost / d.menu_price : null);
  const sorted = [...dishes].sort((a, b) => (share(b) ?? -1) - (share(a) ?? -1));
  const items = stock.map((s) => ({
    id: s.id,
    name: s.name,
    unit: s.unit,
    price: s.last_price,
  }));
  return {
    side: (
      <Panel title="Добавить блюдо" defaultOpen={dishes.length === 0}>
        <p className="mb-4 text-[15px] text-ink-2">Состав одной порции со склада. Себестоимость считается по последним ценам из накладных и меняется вместе с ними.</p>
        <DishForm token={token} stock={items} ai={ai} />
      </Panel>
    ),
    main: (
      <section aria-labelledby="dish-list">
        <h2 id="dish-list" className="text-[24px]">
          Себестоимость блюд
        </h2>
        <p className="mt-2 max-w-[40rem] text-[15px] text-ink-3">Сверху блюда, где продукты занимают большую долю цены в меню.</p>
        {dishes.length === 0 ? (
          <p className="mt-3 text-ink-3">Пока ни одного. Добавьте блюдо — ИИ подскажет состав по названию.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {sorted.map((d) => {
              const sh = share(d);
              return (
                <li key={d.id}>
                  <article className="rounded-tile-r bg-tile p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[17px] text-ink">{d.name}</p>
                        <p className="mt-1 text-[14px] text-ink-3">
                          {[
                            d.menu_price != null ? `в меню ${formatMoney(d.menu_price)}` : "цена в меню не указана",
                            `себестоимость ${d.partial ? "от " : ""}${formatMoney(d.cost)}`,
                          ].join(" · ")}
                        </p>
                      </div>
                      {sh != null ? (
                        <p className="shrink-0 text-right">
                          <span className="num block text-[24px] leading-none text-ink">{Math.round(sh * 100)}%</span>
                          <span className="text-[12px] text-ink-3">доля продуктов</span>
                        </p>
                      ) : null}
                    </div>
                    {d.delta ? (
                      <p className={`mt-3 text-[14px] ${d.delta > 0 ? "text-danger" : "text-success"}`}>
                        {d.delta > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(d.delta))} на порцию после последних поставок: {d.deltaFrom.join(", ")}
                      </p>
                    ) : null}
                    <Toggle label="Состав и правка">
                      <ul className="flex flex-col divide-y divide-line text-[14px]">
                        {d.items.map((it) => (
                          <li key={it.stock_item_id} className="flex justify-between gap-4 py-2">
                            <span className="min-w-0 text-ink">
                              {it.name} · {amount(it.qty, it.unit)}
                            </span>
                            <span className="num shrink-0 text-ink-3">{it.cost != null ? formatMoney(it.cost) : "нет цены"}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-5 border-t border-line pt-5">
                        <DishForm
                          token={token}
                          stock={items}
                          ai={ai}
                          dish={{
                            id: d.id,
                            name: d.name,
                            menu_price: d.menu_price,
                            items: d.items.map((i) => ({
                              stock_item_id: i.stock_item_id,
                              qty: i.qty,
                            })),
                          }}
                        />
                        <ButtonForm
                          action={deleteDish}
                          fields={{ token, id: d.id }}
                          label="Удалить блюдо"
                          confirmText={`Удалить «${d.name}»?`}
                          className={`${QUIET} mt-2`}
                        />
                      </div>
                    </Toggle>
                  </article>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    ),
  };
}

// ── Поля ─────────────────────────────────────────────────────────────────

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
        defaultValue={value == null ? undefined : typeof value === "number" ? qtyText(value) : value}
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
        <Input name="min_qty" label="Заказ при" decimal value={item?.min_qty ?? null} />
        <Input name="par_qty" label="Заказ до" decimal value={item?.par_qty ?? null} />
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
