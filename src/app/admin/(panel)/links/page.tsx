import Link from "next/link";
import { db } from "@/lib/db";
import { siteUrl } from "@/lib/env";
import { isUuid } from "@/lib/forms";
import { createLink, toggleLink } from "../../actions";
import { ActionForm, ButtonForm, CopyButton, VenueOfferSelect } from "../../_ui";
import { Empty, Input, PageHead, Person, Section, Select } from "../../_parts";

export const metadata = { title: "Ссылки" };

type Row = {
  id: string;
  active: boolean;
  code_phrase: string | null;
  member_name: string;
  member_slug: string;
  venue_name: string;
  venue_slug: string;
  offer_title: string | null;
  clicks: number;
  guests: number;
};

export default async function Links({ searchParams }: { searchParams: Promise<{ member?: string; venue?: string }> }) {
  const sp = await searchParams;
  const sql = db();
  const [members, venues, offers, rows] = await Promise.all([
    sql<{ id: string; name: string; slug: string }[]>`select id, name, slug from members where status <> 'archived' order by name`,
    sql<{ id: string; name: string }[]>`select id, name from venues where status <> 'archived' order by name`,
    sql<{ id: string; venue_id: string; title: string }[]>`select id, venue_id, title from offers where active order by created_at`,
    sql<Row[]>`
      select tl.id, tl.active, tl.code_phrase, m.name as member_name, m.slug as member_slug,
             v.name as venue_name, v.slug as venue_slug, o.title as offer_title, ps.clicks, ps.guests
      from tracking_links tl
      join members m on m.id = tl.member_id
      join venues v on v.id = tl.venue_id
      left join offers o on o.id = tl.offer_id
      join pair_stats ps on ps.tracking_link_id = tl.id
      order by tl.active desc, tl.created_at desc`,
  ]);
  const base = siteUrl();
  const defMember = sp.member && isUuid(sp.member) ? sp.member : "";
  const defVenue = sp.venue && isUuid(sp.venue) ? sp.venue : "";

  return (
    <>
      <PageHead title="Ссылки" lead="Пара участница и заведение получает личную ссылку вида /имя/заведение. Её участница ставит в сторис." />

      <Section title="Новая ссылка">
        <div className="rounded-tile-r bg-tile p-5 md:p-8">
          {members.length === 0 || venues.length === 0 ? (
            <p className="text-ink-3">Сначала добавьте хотя бы одну участницу и одно заведение.</p>
          ) : (
            <ActionForm action={createLink} submit="Создать ссылку">
              <div className="grid gap-5 md:grid-cols-3">
                <Select
                  label="Участница"
                  name="member_id"
                  id="l-member"
                  required
                  defaultValue={defMember}
                  options={[{ value: "", label: "Выберите" }, ...members.map((m) => ({ value: m.id, label: m.name }))]}
                />
                <VenueOfferSelect venues={venues} offers={offers} defaultVenue={defVenue} />
              </div>
              <Input label="Кодовая фраза" name="code_phrase" hint="Пусто — «я от {имя}» (по-казахски «мені {имя} жіберді»)" />
            </ActionForm>
          )}
        </div>
      </Section>

      <Section title="Все ссылки">
        {rows.length === 0 ? (
          <Empty>Ссылок пока нет.</Empty>
        ) : (
          <ul className="grid gap-3">
            {rows.map((r) => {
              const url = `${base}/${r.member_slug}/${r.venue_slug}`;
              return (
                <li key={r.id} className={`flex flex-col gap-4 rounded-tile-r bg-tile p-5 lg:flex-row lg:items-center lg:justify-between ${r.active ? "" : "opacity-60"}`}>
                  <Link href={`/admin/links/${r.id}`} className="min-w-0 hover:opacity-80">
                    <Person name={`${r.member_name} · ${r.venue_name}`} slug={r.member_slug} sub={`${r.offer_title ?? "без offer"} · кликов ${r.clicks} · гостей ${r.guests}`} />
                  </Link>
                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <span className="max-w-full truncate text-[14px] text-ink-3">{url.replace(/^https?:\/\//, "")}</span>
                    <CopyButton text={url} />
                    <ButtonForm action={toggleLink} fields={{ id: r.id }} label={r.active ? "Выключить" : "Включить"} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
