import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { siteUrl } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { entryPhotoUrl, publicImageUrl } from "@/lib/storage";
import type { Offer, Venue } from "@/lib/types";
import {
  createOffer,
  deleteOffer,
  deleteVenue,
  regenerateHostToken,
  regenerateManagerToken,
  removeEntryPhoto,
  createReward,
  removeReward,
  removeVenueLogo,
  removeVenuePhoto,
  updateOffer,
  updateVenue,
  uploadEntryPhoto,
  uploadVenueLogo,
  uploadVenuePhoto,
} from "../../../actions";
import { ActionForm, ButtonForm, CopyButton, Disclosure, ImageInput } from "../../../_ui";
import { Empty, PageHead, Person, Section, StatusText } from "../../../_parts";
import { VenueFields } from "../VenueFields";
import { OfferFields } from "../OfferFields";
import { PlanEditor } from "../PlanEditor";
import { loadEntryPhotos, loadPlan } from "@/lib/venueData";
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
  const [plan, entry, rewards, upcoming] = await Promise.all([
    loadPlan(id),
    loadEntryPhotos(id),
    sql<{ id: string; title: string; title_kk: string | null; cost: number; taken: number }[]>`
      select w.id, w.title, w.title_kk, w.cost, (select count(*)::int from blat_redemptions r where r.reward_id = w.id and r.status = 'used') as taken
      from blat_rewards w where w.venue_id = ${id} and w.active order by w.cost`,
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
  const managerUrl = v.manager_token ? `${base}/m/${v.manager_token}` : null;
  const photo = publicImageUrl(v.photo_path);
  const logo = publicImageUrl(v.logo_path);
  const [offerWithPerk] = await sql`select 1 from offers where venue_id = ${id} and active and guest_perk is not null limit 1`;
  // What the venue still has to send before it looks real in the catalog
  // (12 Nov 2026: real photos and a logo instead of generated scenes).
  const readiness: [string, boolean][] = [
    ["Своё фото", !!photo],
    ["Точка на карте", v.lat != null],
    ["Логотип", !!logo],
    ["Описание на русском и казахском", !!v.description && !!v.description_kk],
    ["План зала со столами", plan.items.some((i) => i.kind === "table")],
    ["Вход: фасад, интерьер и зал", ["exterior", "interior", "hall"].every((k) => entry.some((p) => p.kind === k))],
    ["Зоны у столов (у окна, у бара…)", plan.items.some((i) => i.zone)],
    ["Бонус гостям (perk)", !!offerWithPerk],
    ["Угощение за блат", rewards.length > 0],
    ["Показывается в каталоге", v.is_listed],
  ];

  return (
    <>
      <PageHead
        title={v.name}
        lead={<>{v.address ? `${v.address} · ` : ""}{v.avg_check ? `чек ${formatMoney(v.avg_check)} · ` : ""}<StatusText status={v.status} /></>}
        action={<Link href={`/admin/links?venue=${v.id}`} className="btn btn-primary btn-sm">Привязать участницу</Link>}
      />

      <Section title="Готовность к каталогу">
        <ul className="grid gap-2 rounded-tile-r bg-tile p-5 sm:grid-cols-2 md:p-6 lg:grid-cols-3">
          {readiness.map(([label, ok]) => (
            <li key={label} className="flex items-center gap-3 text-[15px]">
              <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-semibold ${ok ? "bg-success text-canvas" : "border border-line text-ink-3"}`}>
                {ok ? "✓︎" : ""}
              </span>
              <span className={ok ? "text-ink-2" : "text-ink"}>
                {label}
                <span className="sr-only">{ok ? ": есть" : ": нет"}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

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

      <Section title="Ссылка для управляющего">
        <div className="flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:p-6">
          <p className="text-[14px] text-ink-3">
            Бэк-офис места: накладные по фото с проверкой сумм и цен, склад с точкой заказа, заказы поставщикам в WhatsApp.
            Здесь видны деньги, поэтому ссылка отдельная от хостес — только владельцу или управляющему.
          </p>
          {managerUrl ? (
            <>
              <p className="break-all rounded-[var(--radius-inner)] bg-raised px-4 py-3 font-mono text-[14px] text-ink">{managerUrl}</p>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton text={managerUrl} label="Скопировать ссылку" />
                <a href={managerUrl} target="_blank" rel="noopener noreferrer" className="link-quiet text-[14px]">Открыть</a>
                <ButtonForm action={regenerateManagerToken} fields={{ id: v.id }} label="Выпустить новую" confirmText="Старая ссылка управляющего перестанет работать. Продолжить?" />
              </div>
            </>
          ) : (
            <ButtonForm action={regenerateManagerToken} fields={{ id: v.id }} label="Выпустить ссылку" className="btn btn-soft btn-sm self-start" />
          )}
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

      <Section title="Угощения за блат">
        <div className="flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:p-6">
          <p className="max-w-[48rem] text-[14px] text-ink-3">
            Гости, которые советуют заведение друзьям, получают балл за каждого пришедшего гостя (его отмечает хостес) и меняют баллы
            на угощение. Только угощения: не скидки и не деньги. Хостес отмечает код угощения на своей странице.
          </p>
          {rewards.length ? (
            <ul className="flex flex-col divide-y divide-line">
              {rewards.map((w) => (
                <li key={w.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3 text-[15px]">
                  <span className="text-ink">
                    {w.title}
                    {w.title_kk ? <span className="text-ink-3"> · {w.title_kk}</span> : null}
                  </span>
                  <span className="flex items-baseline gap-4 text-[14px] text-ink-3">
                    {w.cost} балл. · выдано {w.taken}
                    <ButtonForm action={removeReward} fields={{ id: w.id }} label="Убрать" confirmText="Убрать угощение? Уже выданные коды останутся." />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Угощений нет: в блате это заведение не показывается.</Empty>
          )}
          <Disclosure title="Добавить угощение">
            <ActionForm action={createReward} submit="Добавить">
              <input type="hidden" name="venue_id" value={v.id} />
              <div className="grid gap-4 sm:grid-cols-[2fr_2fr_1fr]">
                <label className="flex flex-col gap-2">
                  <span className="label">Угощение (рус)</span>
                  <input name="title" className="field" maxLength={80} required placeholder="Десерт от шефа" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Угощение (қаз)</span>
                  <input name="title_kk" className="field" maxLength={80} />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Баллов</span>
                  <input name="cost" type="number" min={1} max={100} defaultValue={3} className="field" required />
                </label>
              </div>
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

      <Section title="Вход в заведение">
        <div className="flex flex-col gap-4 rounded-tile-r bg-tile p-5 md:p-6">
          <p className="max-w-[48rem] text-[14px] text-ink-3">
            Гость «заходит» в заведение по фото: фасад с улицы, интерьер, потом зал — и сразу видит, где сесть. Нужны настоящие фото
            этого места, вертикальные или квадратные. Фото зала можно привязать к залу на плане.
          </p>
          {entry.length ? (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {entry.map((p) => {
                const url = entryPhotoUrl(p.path);
                const hallName = plan.halls.find((h) => h.id === p.hall_id)?.name;
                return (
                  <li key={p.id} className="flex flex-col gap-2">
                    <div className="aspect-[4/5] overflow-hidden rounded-[var(--radius-inner)] bg-raised">
                      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : null}
                    </div>
                    <p className="text-[13px] text-ink-2">
                      {p.kind === "exterior" ? "Фасад" : p.kind === "interior" ? "Интерьер" : `Зал${hallName ? `: ${hallName}` : ""}`}
                      {p.caption ? ` · ${p.caption}` : ""}
                      {p.path.startsWith("/") ? " · демо-иллюстрация" : ""}
                    </p>
                    <ButtonForm action={removeEntryPhoto} fields={{ id: p.id }} label="Убрать" confirmText="Убрать это фото?" />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty>Фото входа нет: на странице заведения одно фото или обложка категории.</Empty>
          )}
          <Disclosure title="Добавить фото входа">
            <ActionForm action={uploadEntryPhoto} submit="Загрузить">
              <input type="hidden" name="id" value={v.id} />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="label">Что на фото</span>
                  <select name="kind" className="field" defaultValue="exterior" required>
                    <option value="exterior">Фасад, вход с улицы</option>
                    <option value="interior">Интерьер</option>
                    <option value="hall">Зал</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Какой зал (для фото зала)</span>
                  <select name="hall_id" className="field" defaultValue="">
                    <option value="">Не привязывать</option>
                    {plan.halls.map((h) => (
                      <option key={h.id} value={h.id}>{h.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Подпись (рус), необязательно</span>
                  <input name="caption" className="field" maxLength={140} placeholder="Столы у окон" />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="label">Подпись (қаз), необязательно</span>
                  <input name="caption_kk" className="field" maxLength={140} />
                </label>
              </div>
              <div className="flex flex-col gap-2">
                <label htmlFor="entry-photo" className="label">Фото</label>
                <ImageInput id="entry-photo" name="photo" required />
              </div>
            </ActionForm>
          </Disclosure>
        </div>
      </Section>

      <Section title="Фото и логотип">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid gap-5 rounded-tile-r bg-tile p-5 sm:grid-cols-[12rem_1fr] md:p-6">
            <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[var(--radius-inner)] bg-raised">
              {photo ? <img src={photo} alt={v.name} className="h-full w-full object-cover" /> : <span className="px-3 text-center text-[13px] text-ink-3">Фото нет: в каталоге карточка без картинки</span>}
            </div>
            <div className="flex flex-col gap-4">
              <ActionForm action={uploadVenuePhoto} submit="Загрузить фото">
                <input type="hidden" name="id" value={v.id} />
                <div className="flex flex-col gap-2">
                  <label htmlFor="venue-photo" className="label">Настоящее фото зала, горизонтальное</label>
                  <ImageInput id="venue-photo" name="photo" required />
                </div>
              </ActionForm>
              {photo ? <ButtonForm action={removeVenuePhoto} fields={{ id: v.id }} label="Убрать фото" confirmText="Убрать фото?" /> : null}
            </div>
          </div>
          <div className="grid gap-5 rounded-tile-r bg-tile p-5 sm:grid-cols-[7rem_1fr] md:p-6">
            <div className="grid aspect-square place-items-center overflow-hidden rounded-[var(--radius-inner)] bg-raised">
              {logo ? <img src={logo} alt="" className="h-full w-full object-contain" /> : <span className="text-[13px] text-ink-3">Нет</span>}
            </div>
            <div className="flex flex-col gap-4">
              <ActionForm action={uploadVenueLogo} submit="Загрузить логотип">
                <input type="hidden" name="id" value={v.id} />
                <div className="flex flex-col gap-2">
                  <label htmlFor="venue-logo" className="label">Логотип, квадрат, PNG или JPG</label>
                  <ImageInput id="venue-logo" name="logo" required />
                </div>
              </ActionForm>
              {logo ? <ButtonForm action={removeVenueLogo} fields={{ id: v.id }} label="Убрать логотип" confirmText="Убрать логотип?" /> : null}
            </div>
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
