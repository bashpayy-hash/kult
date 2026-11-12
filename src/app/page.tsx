import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The main screen. After the critique of 12 Nov 2026 it starts with the
 * places themselves (as in the owner's friend's app), in one grid while the
 * catalog is small: three rails of the same six venues read as filler.
 */
export default async function Overview({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { lang, t } = await getDict();
  const C = t.catalog;
  const { c } = await searchParams;
  const category = CATEGORIES.includes(c as Category) ? (c as Category) : null;
  const [cats, list] = await Promise.all([listedCategories(), listVenues({ category })]);
  const free = await nextFreeSlots(list);
  const total = cats.reduce((s, x) => s + x.n, 0);
  const nowMin = almatyNowMinutes();

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pt-6 md:pt-10">
        <h1 className="text-[34px] md:text-[48px]">{C.title}</h1>
        <p className="mt-3 max-w-[40rem] text-[16px] text-ink-2 md:text-[17px]">{C.count(total)}</p>

        {cats.length > 1 ? (
          <nav aria-label={C.allChip} className="mt-6">
            <Rail>
              {[null, ...cats.map((x) => x.category)].map((x) => (
                <Link key={x ?? "all"} href={x ? `/?c=${x}` : "/"} scroll={false} aria-current={x === category ? "true" : undefined} className="chip shrink-0">
                  {x ? C.plural[x as Category] : C.allChip}
                </Link>
              ))}
            </Rail>
          </nav>
        ) : null}

        {list.length === 0 ? (
          <p className="mt-10 text-ink-3">{C.empty}</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((v) => (
              <li key={v.id}>
                <VenueCard v={v} t={t} lang={lang} free={free.get(v.id)} nowMin={nowMin} />
              </li>
            ))}
          </ul>
        )}

        <section className="mt-16 md:mt-24" aria-labelledby="club">
          <div className="flex flex-col gap-6 rounded-tile-r border border-line p-6 sm:p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div className="max-w-[36rem]">
              <h2 id="club" className="text-[24px] md:text-[28px]">
                {C.clubTitle}
              </h2>
              <p className="mt-2 text-ink-2">{C.clubText}</p>
            </div>
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
              <Link href="/join" className="btn btn-primary">
                {C.clubCta}
              </Link>
              <Link href="/join#partners" className="link-quiet text-[15px]">
                {C.partnerLink}
              </Link>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
