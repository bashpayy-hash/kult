import Link from "next/link";
import { db } from "@/lib/db";
import { dicts } from "@/lib/i18n/dicts";
import { formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import type { Application } from "@/lib/types";
import { reviewApplication } from "../../actions";
import { ButtonForm } from "../../_ui";
import { Empty, PageHead, StatusText } from "../../_parts";

export const metadata = { title: "Заявки" };

const TABS = [
  { key: "new", label: "Новые" },
  { key: "approved", label: "Одобренные" },
  { key: "rejected", label: "Отклонённые" },
] as const;

type Row = Application & { member_id: string | null; venue_id: string | null };

export default async function Applications({ searchParams }: { searchParams: Promise<{ status?: string; kind?: string }> }) {
  const sp = await searchParams;
  const status = TABS.some((t) => t.key === sp.status) ? sp.status! : "new";
  const kind = sp.kind === "member" || sp.kind === "partner" ? sp.kind : null;
  const sql = db();
  const [counts, rows] = await Promise.all([
    sql<{ status: string; n: number }[]>`select status, count(*)::int as n from applications group by status`,
    sql<Row[]>`
      select a.*, m.id as member_id, v.id as venue_id
      from applications a
      left join members m on m.application_id = a.id
      left join venues v on v.application_id = a.id
      where a.status = ${status} and (${kind}::text is null or a.kind = ${kind})
      order by a.created_at desc
      limit 300`,
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?.n ?? 0;
  const cat = dicts.ru.categories;
  const href = (s: string, k: string | null) => `/admin/applications?status=${s}${k ? `&kind=${k}` : ""}`;

  return (
    <>
      <PageHead title="Заявки" lead="Одобрение участницы или заведения сразу создаёт карточку. Её можно дополнить и потом выдать ссылки." />
      <div className="mt-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link key={t.key} href={href(t.key, kind)} aria-current={t.key === status ? "page" : undefined} className={`btn btn-sm ${t.key === status ? "bg-ink text-canvas" : "btn-soft"}`}>
            {t.label} · {count(t.key)}
          </Link>
        ))}
        <span className="mx-1 hidden w-px bg-line sm:block" aria-hidden="true" />
        {[
          { k: null, label: "Все" },
          { k: "member", label: "Участницы" },
          { k: "partner", label: "Заведения" },
        ].map((x) => (
          <Link key={x.label} href={href(status, x.k)} aria-current={x.k === kind ? "true" : undefined} className={`btn btn-sm ${x.k === kind ? "bg-raised text-ink" : "text-ink-3 hover:text-ink"}`}>
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {rows.length === 0 ? <Empty>Здесь пусто.</Empty> : null}
        {rows.map((a) => (
          <article key={a.id} className="flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="label">{a.kind === "member" ? "Участница" : "Заведение"} · {formatDateTime(a.created_at)}</p>
                <h3 className="mt-2 text-[22px]">{a.kind === "member" ? a.name : a.venue_name}</h3>
              </div>
              <StatusText status={a.status} />
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[14px]">
              {(a.kind === "member"
                ? [
                    ["Возраст", a.age],
                    ["Город", a.city],
                    ["Instagram", a.instagram ? <a key="ig" href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer" className="link-quiet">@{a.instagram}</a> : "—"],
                    ["Язык", a.lang === "kk" ? "Қазақша" : "Русский"],
                    ["Увлечения", a.interests || "—"],
                  ]
                : [
                    ["Категория", a.category ? cat[a.category] : "—"],
                    ["Средний чек", formatMoney(a.avg_check)],
                    ["Контакт", a.contact_name],
                    ["Телефон", a.phone ? <a key="tel" href={`tel:${a.phone}`} className="link-quiet">{formatPhone(a.phone)}</a> : "—"],
                    ["Instagram", a.instagram ? <a key="ig" href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer" className="link-quiet">@{a.instagram}</a> : "—"],
                  ]
              ).map(([k, v]) => (
                <div key={String(k)} className={k === "Увлечения" ? "col-span-2" : ""}>
                  <dt className="text-ink-3">{k}</dt>
                  <dd className="mt-0.5 text-ink">{v}</dd>
                </div>
              ))}
            </dl>
            {a.review_note ? <p className="text-[14px] text-ink-3">Заметка: {a.review_note}</p> : null}
            <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-line pt-4">
              {a.status === "new" ? (
                <>
                  <ButtonForm action={reviewApplication} fields={{ id: a.id, decision: "approve" }} label="Одобрить" className="btn btn-primary btn-sm" />
                  <ButtonForm action={reviewApplication} fields={{ id: a.id, decision: "reject" }} label="Отклонить" className="btn btn-soft btn-sm" confirmText="Отклонить заявку?" />
                </>
              ) : null}
              {a.status === "approved" && a.member_id ? (
                <Link href={`/admin/members/${a.member_id}`} className="link-quiet text-[14px]">Открыть карточку участницы</Link>
              ) : null}
              {a.status === "approved" && a.venue_id ? (
                <Link href={`/admin/venues/${a.venue_id}`} className="link-quiet text-[14px]">Открыть карточку заведения</Link>
              ) : null}
              {a.status === "rejected" ? (
                <ButtonForm action={reviewApplication} fields={{ id: a.id, decision: "reopen" }} label="Вернуть в новые" className="btn btn-soft btn-sm" />
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
