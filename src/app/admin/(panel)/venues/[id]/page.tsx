import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import { sceneFor } from "@/lib/scenes";
import type { Offer, Venue } from "@/lib/types";
import {
  createOffer,
  deleteOffer,
  deleteVenue,
  regenerateHostToken,
  removeVenuePhoto,
  updateOffer,
  updateVenue,
  uploadVenuePhoto,
} from "../../../actions";
import { ActionForm, ButtonForm, CopyButton, Disclosure, ImageInput } from "../../../_ui";
import { Empty, PageHead, Person, Section, StatusText } from "../../../_parts";
import { VenueFields } from "../VenueFields";
import { OfferFields } from "../OfferFields";
import { PlanEditor } from "../PlanEditor";
import { loadPlan } from "@/lib/venueData";
import { formatDay, formatPhone, formatTime, almatyToday } from "@/lib/format";
import { randomUUID } from "node:crypto";

export default async function VenuePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sql = db();
  const [v] = await sql<Venue[]>`select * from venues where id = ${id}`;
  if (!v) notFound();
  const [offers, links] = await Promise.all([
    sql<Offer[]>`select * from offers where venue_id = ${id} order by active desc, created_at`,
    sql<{ id: string; member_name: string; member_slug: string; active: boolean; guests: number; visits: number }[]>`
      select tl.id, m.name as member_name, m.slug as member_slug, tl.active, ps.guests, ps.member_visits as visits
      from tracking_links tl join members m on m.id = tl.member_id join pair_stats ps on ps.tracking_link_id = tl.id
      where tl.venue_id = ${id} order by m.name`,
  ]);
  const [plan, upcoming] = await Promise.all([
    loadPlan(id),
    sql<{ id: string; booking_date: string; booking_time: string; guest_name: string; phone: string; party_size: number; status: string; table_label: string | null; member_name: string | null }[]>`
      select b.id, b.booking_date, b.booking_time, b.guest_name, b.phone, b.party_size, b.status, vt.label as table_label, m.name as member_name
      from guest_bookings b
      left join venue_tables vt on vt.id = b.table_id
      left join tracking_links tl on tl.id = b.tracking_link_id
      left join members m on m.id = tl.member_id
      where b.venue_id = ${id} and b.booking_date >= ${almatyToday()} and b.status <> 'cancelled'
      order by b.starts_at limit 50`,
  ]);
  const halls = plan.halls.length ? plan.halls : [{ id: randomUUID(), name: "Основной зал", name_kk: "Негізгі зал", width: 100, height: 64 }];
  const base = siteUrl();
  const hostUrl = `${base}/h/${v.host_token}`;
  const photo = publicImageUrl(v.photo_path);

  return (
    <>
      <PageHead
        title={v.name}
        lead={<>{v.address ? `${v.address} · ` : ""}{v.avg_check ? `чек ${formatMoney(v.avg_check)} · ` : ""}<StatusText status={v.status} /></>}
        action={<Link href={`/admin/links?venue=${v.id}`} className="btn btn-primary btn-sm">Привязать участницу</Link>}
      />

      <Section title="Ссылка для хостес">
        <div className="flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:p-6">
          <p className="text-[14px] text-ink-3">
            Отправьте хостес эту ссылку, лучше в личные сообщения: по ней без логина видны брони и можно отмечать гостей.
            Если ссылка утекла, выпустите новую — старая сразу перестанет работать.
          </p>
          <p className="break-all rounded-[var(--radius-inner)] bg-raised px-4 py-3 font-mono text-[14px] text-ink">{hostUrl}</p>
          <div className="flex flex-wrap items-center gap-3">
            <CopyButton text={hostUrl} label="Скопировать ссылку" />
            <a href={hostUrl} target="_blank" rel="noopener noreferrer" className="link-quiet text-[14px]">Открыть</a>
            <ButtonForm action={regenerateHostToken} fields={{ id: v.id }} label="Выпустить новую" confirmText="Старая ссылка хостес перестанет работать. Продолжить?" />
          </div>
        </div>
      </Section>

      <Section title="План зала">
        <div className="rounded-tile-r bg-tile p-4 md:p-6">
          <p className="mb-4 max-w-[48rem] text-[14px] text-ink-3">
            Гости видят этот план на странице заведения и выбирают стол. Брони ложатся на столы по вместимости, один стол нельзя
            занять на пересекающееся время. Без столов бронь принимается без привязки к месту.
          </p>
          <PlanEditor venueId={v.id} initialHalls={halls} initialItems={plan.items} />
        </div>
      </Section>

      <Section title="Ближайшие брони" aside={v.is_listed ? <a href={`${base}/v/${v.slug}`} target="_blank" rel="noopener noreferrer" className="link-quiet text-[14px]">Страница в каталоге</a> : <span className="text-[14px] text-ink-3">Не показывается в каталоге</span>}>
        {upcoming.length === 0 ? (
          <Empty>Броней на сегодня и дальше нет.</Empty>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
            {upcoming.map((b) => (
              <li key={b.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3.5 text-[15px]">
                <span className="text-ink">
                  {formatDay(b.booking_date)}, {formatTime(b.booking_time)} · {b.guest_name} · гостей {b.party_size}
                  {b.table_label ? ` · стол ${b.table_label}` : ""}
                </span>
                <span className="text-[14px] text-ink-3">
                  <a href={`tel:${b.phone}`} className="link-quiet">{formatPhone(b.phone)}</a> · {b.member_name ? `от ${b.member_name}` : "каталог"} · <StatusText status={b.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Offers и perks">
        <div className="flex flex-col gap-3">
          {offers.length === 0 ? <Empty>Offers пока нет. Без offer ссылка работает, но гости не увидят бонус.</Empty> : null}
          {offers.map((o) => (
            <Disclosure key={o.id} title={`${o.title}${o.active ? "" : " · выключен"}`}>
              <ActionForm action={updateOffer} submit="Сохранить" secondary={<ButtonForm action={deleteOffer} fields={{ id: o.id }} label="Удалить" confirmText="Удалить offer? Ссылки останутся без бонуса." />}>
                <input type="hidden" name="id" value={o.id} />
                <OfferFields o={o} idp={`o-${o.id.slice(0, 8)}`} />
              </ActionForm>
            </Disclosure>
          ))}
          <Disclosure title="Добавить offer">
            <ActionForm action={createOffer} submit="Добавить">
              <input type="hidden" name="venue_id" value={v.id} />
              <OfferFields idp="o-new" />
            </ActionForm>
          </Disclosure>
        </div>
      </Section>

      <Section title="Участницы">
        {links.length === 0 ? (
          <Empty>Ни одна участница ещё не привязана.</Empty>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {links.map((l) => (
              <li key={l.id}>
                <Link href={`/admin/links/${l.id}`} className="flex items-center justify-between gap-3 rounded-tile-r bg-tile p-5 transition-colors duration-150 hover:bg-raised">
                  <Person name={l.member_name} slug={l.member_slug} sub={`${l.active ? "Активна" : "Выключена"} · визитов ${l.visits} · гостей ${l.guests}`} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Фото для страницы гостей">
        <div className="grid gap-5 rounded-tile-r bg-tile p-5 md:grid-cols-[16rem_1fr] md:p-6">
          <div className="aspect-[4/3] overflow-hidden rounded-[var(--radius-inner)] bg-raised">
            <img src={photo ?? sceneFor(v.category).src} alt={v.name} className="h-full w-full object-cover" />
          </div>
          <div className="flex flex-col gap-4">
            <ActionForm action={uploadVenuePhoto} submit="Загрузить">
              <input type="hidden" name="id" value={v.id} />
              <div className="flex flex-col gap-2">
                <label htmlFor="venue-photo" className="label">Фото, горизонтальное 4:3</label>
                {photo ? null : <p className="text-[13px] text-ink-3">Пока своего фото нет, гости видят картинку категории.</p>}
                <ImageInput id="venue-photo" name="photo" required />
              </div>
            </ActionForm>
            {photo ? <ButtonForm action={removeVenuePhoto} fields={{ id: v.id }} label="Убрать фото" confirmText="Убрать фото?" /> : null}
          </div>
        </div>
      </Section>

      <Section title="Карточка">
        <div className="rounded-tile-r bg-tile p-5 md:p-8">
          <ActionForm action={updateVenue} submit="Сохранить">
            <input type="hidden" name="id" value={v.id} />
            <VenueFields v={v} />
          </ActionForm>
        </div>
      </Section>

      <Section title="Удаление">
        <div className="flex flex-col gap-3 rounded-tile-r bg-tile p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <p className="text-[14px] text-ink-3">Если у заведения уже есть ссылки, карточка уйдёт в архив: данные пилота сохранятся.</p>
          <ButtonForm action={deleteVenue} fields={{ id: v.id }} label="Удалить заведение" className="btn btn-soft btn-sm text-danger" confirmText="Удалить заведение?" />
        </div>
      </Section>
    </>
  );
}
