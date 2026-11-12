import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { listedCategories, listVenues } from "@/lib/venueData";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Места" };

/** «Смотреть все»: every listed venue, filtered by category. */
export default async function Places({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { lang, t } = await getDict();
  const C = t.catalog;
  const { c } = await searchParams;
  const category = CATEGORIES.includes(c as Category) ? (c as Category) : null;
  const [cats, list] = await Promise.all([listedCategories(), listVenues({ category })]);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pt-8 md:pt-12">
        <h1 className="text-[38px] md:text-[48px]">{C.allTitle}</h1>
        <div className="mt-6">
          <Rail>
            {[null, ...cats].map((x) => (
              <Link
                key={x ?? "all"}
                href={x ? `/places?c=${x}` : "/places"}
                aria-current={x === category ? "true" : undefined}
                className={`btn shrink-0 ${x === category ? "bg-ink text-canvas" : "btn-soft"}`}
              >
                {x ? C.plural[x as Category] : C.allChip}
              </Link>
            ))}
          </Rail>
        </div>
        {list.length === 0 ? (
          <p className="mt-10 text-ink-3">{C.empty}</p>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((v) => (
              <li key={v.id} className="flex">
                <VenueCard v={v} t={t} lang={lang} perk wide />
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter t={t} />
    </>
  );
}
