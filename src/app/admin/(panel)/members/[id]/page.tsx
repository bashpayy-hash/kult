import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { siteUrl } from "@/lib/env";
import type { Member } from "@/lib/types";
import { deleteMember, updateMember } from "../../../actions";
import { ActionForm, ButtonForm, CopyButton } from "../../../_ui";
import { Empty, PageHead, Section, StatusText } from "../../../_parts";
import { MemberFields } from "../MemberFields";

export default async function MemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sql = db();
  const [m] = await sql<Member[]>`select * from members where id = ${id}`;
  if (!m) notFound();
  const links = await sql<{ id: string; venue_name: string; venue_slug: string; active: boolean; guests: number; visits: number }[]>`
    select tl.id, v.name as venue_name, v.slug as venue_slug, tl.active, ps.guests, ps.member_visits as visits
    from tracking_links tl join venues v on v.id = tl.venue_id join pair_stats ps on ps.tracking_link_id = tl.id
    where tl.member_id = ${id} order by v.name`;
  const base = siteUrl();

  return (
    <>
      <PageHead
        title={m.name}
        lead={<>{m.instagram ? `@${m.instagram} · ` : ""}<StatusText status={m.status} /></>}
        action={<Link href={`/admin/links?member=${m.id}`} className="btn btn-primary btn-sm">Выдать ссылку</Link>}
      />

      <Section title="Ссылки">
        {links.length === 0 ? (
          <Empty>Ссылок пока нет.</Empty>
        ) : (
          <ul className="grid gap-3">
            {links.map((l) => {
              const url = `${base}/${m.slug}/${l.venue_slug}`;
              return (
                <li key={l.id} className="flex flex-col gap-3 rounded-tile-r bg-tile p-5 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0">
                    <Link href={`/admin/links/${l.id}`} className="text-[17px] text-ink hover:opacity-80">{l.venue_name}</Link>
                    <p className="mt-1 truncate text-[14px] text-ink-3">{url}</p>
                    <p className="mt-1 text-[13px] text-ink-3">
                      {l.active ? "Активна" : "Выключена"} · визитов {l.visits} · гостей {l.guests}
                    </p>
                  </div>
                  <CopyButton text={url} label="Скопировать ссылку" />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Анкета">
        <div className="rounded-tile-r bg-tile p-5 md:p-8">
          <ActionForm action={updateMember} submit="Сохранить">
            <input type="hidden" name="id" value={m.id} />
            <MemberFields m={m} />
          </ActionForm>
        </div>
      </Section>

      <Section title="Удаление">
        <div className="flex flex-col gap-3 rounded-tile-r bg-tile p-5 md:flex-row md:items-center md:justify-between md:p-6">
          <p className="text-[14px] text-ink-3">Если у участницы уже есть ссылки, карточка уйдёт в архив: данные пилота сохранятся.</p>
          <ButtonForm action={deleteMember} fields={{ id: m.id }} label="Удалить участницу" className="btn btn-soft btn-sm text-danger" confirmText="Удалить участницу?" />
        </div>
      </Section>
    </>
  );
}
