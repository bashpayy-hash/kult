import Link from "next/link";
import { db } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import type { Member } from "@/lib/types";
import { createMember } from "../../actions";
import { ActionForm, Disclosure } from "../../_ui";
import { Empty, PageHead, Person, StatusText } from "../../_parts";
import { MemberFields } from "./MemberFields";

export const metadata = { title: "Участницы" };

type Row = Member & { links: number; visits: number; guests: number };

export default async function Members() {
  const rows = await db()<Row[]>`
    select m.*,
      (select count(*) from tracking_links tl where tl.member_id = m.id)::int as links,
      (select count(*) from member_visits mv join tracking_links tl on tl.id = mv.tracking_link_id where tl.member_id = m.id)::int as visits,
      (select coalesce(sum(gv.guests_count), 0) from guest_visits gv join tracking_links tl on tl.id = gv.tracking_link_id where tl.member_id = m.id)::int as guests
    from members m
    order by m.status = 'archived', m.created_at desc`;
  return (
    <>
      <PageHead title="Участницы" lead="Имя видят подписчики на странице заведения и в фразе «я от …». Slug — часть личной ссылки." />
      <div className="mt-8">
        <Disclosure title="Добавить участницу">
          <ActionForm action={createMember} submit="Создать">
            <MemberFields />
          </ActionForm>
        </Disclosure>
      </div>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 ? <Empty>Участниц пока нет. Одобрите заявку или добавьте вручную.</Empty> : null}
        {rows.map((m) => (
          <li key={m.id}>
            <Link href={`/admin/members/${m.id}`} className="flex h-full flex-col gap-4 rounded-tile-r bg-tile p-5 transition-colors duration-150 hover:bg-raised">
              <div className="flex items-start justify-between gap-3">
                <Person name={m.name} slug={m.slug} sub={m.instagram ? `@${m.instagram}` : `/${m.slug}`} />
                <StatusText status={m.status} />
              </div>
              <p className="text-[14px] text-ink-3">
                {[`${m.age} лет`, m.followers ? `${formatNumber(m.followers)} подписчиков` : null, `ссылок ${m.links}`, `визитов ${m.visits}`, `гостей ${m.guests}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
