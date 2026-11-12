import Link from "next/link";
import { db } from "@/lib/db";
import { dicts } from "@/lib/i18n/dicts";
import { formatMoney } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import type { Venue } from "@/lib/types";
import { coverFor } from "@/lib/covers";
import { createVenue } from "../../actions";
import { ActionForm, Disclosure } from "../../_ui";
import { Empty, PageHead, StatusText } from "../../_parts";
import { VenueFields } from "./VenueFields";

export const metadata = { title: "Заведения" };

type Row = Venue & { links: number; offers: number };

export default async function Venues() {
  const rows = await db()<Row[]>`
    select v.*,
      (select count(*) from tracking_links tl where tl.venue_id = v.id)::int as links,
      (select count(*) from offers o where o.venue_id = v.id and o.active)::int as offers
    from venues v order by v.status = 'archived', v.created_at desc`;
  return (
    <>
      <PageHead title="Заведения" lead="У каждого заведения своя секретная ссылка для хостес и свои offers: что получает участница и что получают её подписчики." />
      <div className="mt-8">
        <Disclosure title="Добавить заведение">
          <ActionForm action={createVenue} submit="Создать">
            <VenueFields />
          </ActionForm>
        </Disclosure>
      </div>
      <ul className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.length === 0 ? <Empty>Заведений пока нет.</Empty> : null}
        {rows.map((v) => {
          const photo = publicImageUrl(v.photo_path);
          return (
            <li key={v.id}>
              <Link href={`/admin/venues/${v.id}`} className="flex h-full gap-4 rounded-tile-r bg-tile p-4 transition-colors duration-150 hover:bg-raised">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-inner)] bg-raised">
                  <img src={photo ?? coverFor(v.category).src} alt="" className="h-full w-full object-cover" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate text-[17px] text-ink">{v.name}</p>
                    <StatusText status={v.status} />
                  </div>
                  <p className="mt-1 text-[14px] text-ink-3">{[dicts.ru.categories[v.category], v.avg_check ? `чек ${formatMoney(v.avg_check)}` : null].filter(Boolean).join(" · ")}</p>
                  <p className="mt-1 text-[13px] text-ink-3">offers {v.offers} · ссылок {v.links}</p>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
