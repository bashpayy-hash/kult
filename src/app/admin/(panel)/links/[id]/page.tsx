import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { pilotThreshold, siteUrl } from "@/lib/env";
import { almatyToday, formatDateTime, formatDay, formatMoney, formatNumber, formatPhone, formatTime } from "@/lib/format";
import { signedImageUrls } from "@/lib/storage";
import type { PairStats } from "@/lib/types";
import {
  addMemberVisit,
  addProof,
  deleteGuestVisit,
  deleteLink,
  deleteMemberVisit,
  deleteProof,
  setBookingStatus,
  updateLink,
  updateProof,
} from "../../../actions";
import { ActionForm, ButtonForm, CopyButton, Disclosure, ImageInput } from "../../../_ui";
import { Checkbox, Empty, Input, PageHead, Section, Select, Stat, StatusText } from "../../../_parts";

type Visit = { id: string; visit_date: string; received: string | null; reward_value: number | null; source: string; notes: string | null };
type Proof = { id: string; member_visit_id: string; kind: string; screenshot_path: string | null; views: number | null; posted_at: string | null };
type Booking = {
  id: string; guest_name: string; phone: string; booking_date: string; booking_time: string; party_size: number;
  comment: string | null; status: string; created_at: Date; guests_count: number | null; check_amount: number | null;
};
type PhraseVisit = { id: string; visit_date: string; guests_count: number; check_amount: number };

const KIND = [
  { value: "story", label: "Сторис" },
  { value: "reel", label: "Reels" },
  { value: "post", label: "Пост" },
];

export default async function LinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sql = db();
  const [s] = await sql<(PairStats & { code_phrase: string | null; offer_id: string | null })[]>`
    select ps.*, tl.code_phrase, tl.offer_id from pair_stats ps join tracking_links tl on tl.id = ps.tracking_link_id
    where ps.tracking_link_id = ${id}`;
  if (!s) notFound();

  const [offers, visits, proofs, bookings, phrase] = await Promise.all([
    sql<{ id: string; title: string; member_reward: string; active: boolean }[]>`select id, title, member_reward, active from offers where venue_id = ${s.venue_id} order by created_at`,
    sql<Visit[]>`select id, visit_date, received, reward_value, source, notes from member_visits where tracking_link_id = ${id} order by visit_date desc, created_at desc`,
    sql<Proof[]>`
      select cp.id, cp.member_visit_id, cp.kind, cp.screenshot_path, cp.views, cp.posted_at
      from content_proofs cp join member_visits mv on mv.id = cp.member_visit_id
      where mv.tracking_link_id = ${id} order by cp.created_at`,
    sql<Booking[]>`
      select b.id, b.guest_name, b.phone, b.booking_date, b.booking_time, b.party_size, b.comment, b.status, b.created_at,
             gv.guests_count, gv.check_amount
      from guest_bookings b left join guest_visits gv on gv.booking_id = b.id
      where b.tracking_link_id = ${id} order by b.booking_date desc, b.booking_time desc`,
    sql<PhraseVisit[]>`
      select id, visit_date, guests_count, check_amount from guest_visits
      where tracking_link_id = ${id} and source = 'phrase' order by visit_date desc, created_at desc`,
  ]);
  const shots = await signedImageUrls(proofs.map((p) => p.screenshot_path).filter((x): x is string => !!x));
  const url = `${siteUrl()}/${s.member_slug}/${s.venue_slug}`;
  const threshold = pilotThreshold();
  const pass = s.member_visits > 0 && (s.guests_per_visit ?? 0) >= threshold;
  const currentOffer = offers.find((o) => o.id === s.offer_id);

  return (
    <>
      <PageHead
        title={`${s.member_name} · ${s.venue_name}`}
        lead={
          <>
            <Link href={`/admin/members/${s.member_id}`} className="link-quiet">Участница</Link>
            {" · "}
            <Link href={`/admin/venues/${s.venue_id}`} className="link-quiet">Заведение</Link>
            {" · "}
            <StatusText status={s.active ? "active" : "archived"} text={s.active ? "Ссылка активна" : "Ссылка выключена"} />
          </>
        }
      />

      <div className="mt-8 flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:flex-row md:items-center md:justify-between md:p-6">
        <div className="min-w-0">
          <p className="label">Ссылка для сторис</p>
          <p className="mt-2 break-all text-[17px] text-ink">{url}</p>
          <p className="mt-1 text-[14px] text-ink-3">Фраза на входе: «{s.code_phrase || `я от ${s.member_name}`}»</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <CopyButton text={url} label="Скопировать ссылку" />
          <a href={url} target="_blank" rel="noopener noreferrer" className="link-quiet text-[14px]">Открыть</a>
        </div>
      </div>
      <p className="mt-2 px-1 text-[13px] text-ink-3">Открытия из админки тоже считаются кликами: для проверки лучше открывать в приватном окне один раз.</p>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Гостей на визит" value={formatNumber(s.guests_per_visit, 2)} good={pass} hint={`Порог ${formatNumber(threshold, 2)}`} />
        <Stat label="Гости" value={s.guests} hint={`по брони ${s.guests_booking} · по фразе ${s.guests_phrase}`} />
        <Stat label="Выручка" value={formatMoney(s.revenue)} />
        <Stat label="Конверсия" value={s.view_to_guest_pct == null ? "—" : `${formatNumber(s.view_to_guest_pct, 2)}%`} hint="гостей из просмотров" />
        <Stat label="Визиты участницы" value={s.member_visits} />
        <Stat label="Просмотры" value={formatNumber(s.views)} />
        <Stat label="Клики" value={formatNumber(s.clicks)} hint={`уникальных ${s.unique_clicks}`} />
        <Stat label="Брони" value={s.bookings} />
      </div>

      <Section title="Визиты участницы и сторис">
        <div className="flex flex-col gap-3">
          <Disclosure title="Добавить визит" defaultOpen={visits.length === 0}>
            <ActionForm action={addMemberVisit} submit="Добавить визит">
              <input type="hidden" name="link_id" value={id} />
              <div className="grid gap-5 md:grid-cols-3">
                <Input label="Дата" name="visit_date" type="date" defaultValue={almatyToday()} required />
                <Input label="Что получила" name="received" placeholder={currentOffer?.member_reward ?? ""} className="md:col-span-2" />
              </div>
              <div className="grid gap-5 md:grid-cols-3">
                <Input label="Номинал, ₸" name="reward_value" inputMode="numeric" hint="Пусто — из offer" />
                <Input label="Заметка" name="notes" className="md:col-span-2" />
              </div>
            </ActionForm>
          </Disclosure>

          {visits.length === 0 ? <Empty>Визитов пока нет. Хостес отмечает их на своей странице, или добавьте здесь.</Empty> : null}
          {visits.map((v) => {
            const list = proofs.filter((p) => p.member_visit_id === v.id);
            return (
              <article key={v.id} className="rounded-tile-r bg-tile p-5 md:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-[20px]">{formatDay(v.visit_date)}</h3>
                    <p className="mt-1 text-[14px] text-ink-3">
                      {[v.received, v.reward_value != null ? formatMoney(v.reward_value) : null, v.source === "host" ? "отметила хостес" : "добавлено в админке", v.notes]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </div>
                  <ButtonForm action={deleteMemberVisit} fields={{ id: v.id }} label="Удалить визит" confirmText="Удалить визит вместе со скринами?" />
                </div>

                {list.length ? (
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((p) => {
                      const src = p.screenshot_path ? shots[p.screenshot_path] : null;
                      return (
                        <li key={p.id} className="flex gap-4 rounded-[var(--radius-inner)] bg-raised p-3">
                          <a href={src ?? undefined} target="_blank" rel="noopener noreferrer" className="block h-32 w-[4.5rem] shrink-0 overflow-hidden rounded-[10px] bg-line">
                            {src ? <img src={src} alt="Скрин сторис" className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center text-[12px] text-ink-3">нет скрина</span>}
                          </a>
                          <div className="flex min-w-0 flex-1 flex-col gap-2">
                            <p className="text-[13px] text-ink-3">
                              {KIND.find((k) => k.value === p.kind)?.label}
                              {p.posted_at ? ` · ${formatDay(p.posted_at)}` : ""}
                            </p>
                            <ActionForm action={updateProof} submit="Сохранить" className="flex flex-col gap-2">
                              <input type="hidden" name="id" value={p.id} />
                              <label htmlFor={`views-${p.id}`} className="label">Просмотры</label>
                              <input id={`views-${p.id}`} name="views" inputMode="numeric" className="field min-h-10! py-2!" defaultValue={p.views ?? ""} />
                            </ActionForm>
                            <ButtonForm action={deleteProof} fields={{ id: p.id }} label="Удалить" confirmText="Удалить скрин?" />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                <div className="mt-5">
                  <Disclosure title={list.length ? "Добавить ещё скрин" : "Добавить скрин сторис и просмотры"}>
                    <ActionForm action={addProof} submit="Сохранить">
                      <input type="hidden" name="member_visit_id" value={v.id} />
                      <div className="flex flex-col gap-2">
                        <label htmlFor={`shot-${v.id}`} className="label">Скрин сторис</label>
                        <ImageInput id={`shot-${v.id}`} name="screenshot" />
                      </div>
                      <div className="grid gap-5 md:grid-cols-3">
                        <Input id={`pv-${v.id}`} label="Просмотры" name="views" inputMode="numeric" />
                        <Select id={`pk-${v.id}`} label="Тип" name="kind" options={KIND} defaultValue="story" />
                        <Input id={`pd-${v.id}`} label="Дата публикации" name="posted_at" type="date" defaultValue={v.visit_date} />
                      </div>
                    </ActionForm>
                  </Disclosure>
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="Брони по ссылке">
        {bookings.length === 0 ? (
          <Empty>Броней пока нет.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 rounded-tile-r bg-tile p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[17px] text-ink">
                    {formatDay(b.booking_date)}, {formatTime(b.booking_time)} · {b.guest_name}
                  </p>
                  <StatusText status={b.status} />
                </div>
                <p className="text-[14px] text-ink-3">
                  <a href={`tel:${b.phone}`} className="link-quiet">{formatPhone(b.phone)}</a> · гостей {b.party_size} · создана {formatDateTime(b.created_at)}
                </p>
                {b.comment ? <p className="text-[14px] text-ink-2">{b.comment}</p> : null}
                {b.status === "arrived" ? <p className="text-[14px] text-success">Пришли {b.guests_count} · {formatMoney(b.check_amount)}</p> : null}
                <div className="mt-1 flex flex-wrap gap-4">
                  {b.status !== "cancelled" ? <ButtonForm action={setBookingStatus} fields={{ id: b.id, status: "cancelled" }} label="Отменить бронь" confirmText="Отменить бронь? Отметка о приходе тоже удалится." /> : null}
                  {b.status !== "new" ? <ButtonForm action={setBookingStatus} fields={{ id: b.id, status: "new" }} label="Вернуть в ожидание" confirmText="Сбросить статус брони?" /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Гости без брони, по фразе">
        {phrase.length === 0 ? (
          <Empty>Пока никого.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
            {phrase.map((g) => (
              <li key={g.id} className="flex items-center justify-between gap-3 py-4">
                <span className="text-ink">
                  {formatDay(g.visit_date)} · гостей {g.guests_count} · {formatMoney(g.check_amount)}
                </span>
                <ButtonForm action={deleteGuestVisit} fields={{ id: g.id }} label="Удалить" confirmText="Удалить запись?" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Настройки ссылки">
        <div className="rounded-tile-r bg-tile p-5 md:p-8">
          <ActionForm action={updateLink} submit="Сохранить">
            <input type="hidden" name="id" value={id} />
            <div className="grid gap-5 md:grid-cols-2">
              <Select
                label="Offer"
                name="offer_id"
                defaultValue={s.offer_id ?? ""}
                options={[{ value: "", label: "Без offer" }, ...offers.map((o) => ({ value: o.id, label: `${o.title}${o.active ? "" : " (выключен)"}` }))]}
              />
              <Input label="Кодовая фраза" name="code_phrase" defaultValue={s.code_phrase} hint={`Пусто — «я от ${s.member_name}»`} />
            </div>
            <Checkbox label="Ссылка активна: страница принимает брони" name="active" defaultChecked={s.active} />
          </ActionForm>
        </div>
        <div className="mt-3 flex flex-col gap-3 rounded-tile-r bg-tile p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <p className="text-[14px] text-ink-3">Если по ссылке уже были визиты или брони, она только выключится: данные пилота сохранятся.</p>
          <ButtonForm action={deleteLink} fields={{ id }} label="Удалить ссылку" className="btn btn-soft btn-sm text-danger" confirmText="Удалить ссылку?" />
        </div>
      </Section>
    </>
  );
}
