import Link from "next/link";
import { db } from "@/lib/db";
import { pilotThreshold } from "@/lib/env";
import { formatMoney, formatNumber } from "@/lib/format";
import type { PairStats } from "@/lib/types";
import { Empty, PageHead, Person, Stat } from "../_parts";

export default async function Dashboard() {
  const threshold = pilotThreshold();
  const rows = await db()<PairStats[]>`
    select * from pair_stats
    order by guests_per_visit desc nulls last, guests desc, member_name`;

  const sum = (k: keyof PairStats) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  const visits = sum("member_visits"), guests = sum("guests"), views = sum("views");
  const gpv = visits ? guests / visits : null;
  const withVisits = rows.filter((r) => r.member_visits > 0);
  const passed = withVisits.filter((r) => (r.guests_per_visit ?? 0) >= threshold);
  const pass = (r: PairStats) => r.member_visits > 0 && (r.guests_per_visit ?? 0) >= threshold;

  return (
    <>
      <PageHead
        title="Пилот"
        lead={`Сколько платящих гостей приводит один визит участницы. Порог успеха: ${formatNumber(threshold, 2)} гостя на визит.`}
        action={
          <a href="/admin/export" className="btn btn-primary btn-sm" download>
            Скачать CSV
          </a>
        }
      />

      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Гостей на визит" value={formatNumber(gpv, 2)} good={gpv != null && gpv >= threshold} hint={`${guests} гостей · ${visits} визитов`} />
        <Stat label="Пары на пороге" value={`${passed.length} из ${withVisits.length}`} hint="Пары с визитами участницы" good={passed.length > 0} />
        <Stat label="Выручка" value={formatMoney(sum("revenue"))} hint="Сумма чеков гостей" />
        <Stat
          label="Гости из просмотров"
          value={views ? `${formatNumber((100 * guests) / views, 2)}%` : "—"}
          hint={`${formatNumber(views)} просмотров · ${formatNumber(sum("clicks"))} кликов · ${formatNumber(sum("bookings"))} броней`}
        />
      </div>

      <h2 className="mt-12 text-[30px]">Пары участница и заведение</h2>
      {rows.length === 0 ? (
        <div className="mt-4">
          <Empty>
            Пар пока нет. Заведите участницу и заведение, потом создайте ссылку в разделе{" "}
            <Link href="/admin/links" className="link-quiet">
              «Ссылки»
            </Link>
            .
          </Empty>
        </div>
      ) : (
        <>
          {/* Desktop: one table. Rows at or above the threshold are tinted green. */}
          <div className="mt-4 hidden overflow-hidden rounded-tile-r bg-tile lg:block">
            <table className="w-full text-left text-[14px]">
              <thead className="text-[13px] text-ink-3">
                <tr className="border-b border-line">
                  <th className="px-5 py-4 font-semibold">Пара</th>
                  {["Визиты", "Просмотры", "Клики", "Брони", "Гости", "Выручка", "Гостей на визит", "Конверсия"].map((h) => (
                    <th key={h} className="px-3 py-4 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.tracking_link_id} className={`border-b border-line last:border-0 ${pass(r) ? "bg-success/[0.08] shadow-[inset_3px_0_0_var(--color-success)]" : ""}`}>
                    <td className="px-5 py-3.5">
                      <Link href={`/admin/links/${r.tracking_link_id}`} className="block hover:opacity-80">
                        <Person name={r.member_name} slug={r.member_slug} sub={`${r.venue_name}${r.active ? "" : " · выключена"}`} />
                      </Link>
                    </td>
                    <td className="px-3 text-right tabular-nums">{r.member_visits}</td>
                    <td className="px-3 text-right tabular-nums">{formatNumber(r.views)}</td>
                    <td className="px-3 text-right tabular-nums" title={`Уникальных: ${r.unique_clicks}`}>
                      {formatNumber(r.clicks)}
                    </td>
                    <td className="px-3 text-right tabular-nums">{r.bookings}</td>
                    <td className="px-3 text-right tabular-nums" title={`По брони: ${r.guests_booking} · по фразе: ${r.guests_phrase}`}>
                      {r.guests}
                    </td>
                    <td className="px-3 text-right tabular-nums">{formatMoney(r.revenue)}</td>
                    <td className={`px-3 text-right font-semibold tabular-nums ${pass(r) ? "text-success" : "text-ink"}`}>
                      {formatNumber(r.guests_per_visit, 2)}
                    </td>
                    <td className="px-5 text-right tabular-nums">{r.view_to_guest_pct == null ? "—" : `${formatNumber(r.view_to_guest_pct, 2)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone and tablet: one card per pair. */}
          <ul className="mt-4 grid gap-3 md:grid-cols-2 lg:hidden">
            {rows.map((r) => (
              <li key={r.tracking_link_id}>
                <Link
                  href={`/admin/links/${r.tracking_link_id}`}
                  className={`block rounded-tile-r p-5 ${pass(r) ? "bg-success/[0.08] ring-1 ring-success/30" : "bg-tile"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <Person name={r.member_name} slug={r.member_slug} sub={`${r.venue_name}${r.active ? "" : " · выключена"}`} />
                    <div className="text-right">
                      <p className={`font-serif text-[32px] leading-none ${pass(r) ? "text-success" : "text-ink"}`}>{formatNumber(r.guests_per_visit, 2)}</p>
                      <p className="mt-1 text-[12px] text-ink-3">гостей на визит</p>
                    </div>
                  </div>
                  <dl className="mt-4 grid grid-cols-3 gap-x-3 gap-y-3 text-[13px]">
                    {[
                      ["Визиты", r.member_visits],
                      ["Просмотры", formatNumber(r.views)],
                      ["Клики", formatNumber(r.clicks)],
                      ["Брони", r.bookings],
                      ["Гости", r.guests],
                      ["Выручка", formatMoney(r.revenue)],
                    ].map(([k, v]) => (
                      <div key={String(k)}>
                        <dt className="text-ink-3">{k}</dt>
                        <dd className="mt-0.5 text-[15px] text-ink tabular-nums">{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <p className="mt-3 text-[13px] text-ink-3">
                    Конверсия просмотров в гостей: {r.view_to_guest_pct == null ? "—" : `${formatNumber(r.view_to_guest_pct, 2)}%`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
