import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/types";
import { CLUB_COVER } from "@/lib/covers";

export const dynamic = "force-dynamic";

/**
 * The main screen: a cover, then the places in one grid (three rails of the
 * same six venues read as filler), then the club on a paper band.
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
      <main>
        {/* A 1970s annual-report cover: one golden backlit photograph, the
            title in black on its calm sky (12 Nov 2026, owner's references:
            Heublein 1970, Coca-Cola 1983, Paul Rand 1954). On phones the
            photograph sits on top and the title follows on the dark page. */}
        <section className="relative">
          <div className="relative aspect-[4/3] overflow-hidden bg-[#c8841f] sm:aspect-[16/9] lg:aspect-auto lg:h-[min(calc(100dvh-80px),760px)] lg:min-h-[560px]">
            <img
              src="/covers/hero-1600.webp"
              srcSet="/covers/hero-640.webp 640w, /covers/hero-1024.webp 1024w, /covers/hero-1600.webp 1600w, /covers/hero-2400.webp 2400w"
              sizes="100vw"
              alt={C.heroAlt}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-[18%_50%] lg:object-center"
            />
          </div>
          <div className="px-edge lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-[9%] lg:flex lg:justify-end">
            <div className="rise pt-8 lg:pointer-events-auto lg:max-w-[30rem] lg:pt-0 lg:text-paper-ink">
              <p className="text-[14px] font-semibold text-ink-3 lg:text-paper-ink">{C.issue}</p>
              <h1 className="mt-3 text-[40px] sm:text-[52px] lg:text-[72px] lg:leading-[0.98] lg:text-paper-ink">{C.title}</h1>
              <p className="mt-5 max-w-[30rem] text-[17px] text-ink-2 lg:text-[18px] lg:text-paper-ink">{C.count(total)}</p>
              <a href="#places" className="btn btn-primary mt-7 w-full sm:w-auto lg:bg-paper-ink lg:text-paper lg:hover:bg-black">
                {C.cta}
              </a>
            </div>
          </div>
        </section>

        <section id="places" className="px-edge scroll-mt-4 pt-14 md:pt-20" aria-label={C.title}>
          {cats.length > 1 ? (
            <nav aria-label={C.allChip}>
              <Rail>
                {[null, ...cats.map((x) => x.category)].map((x) => (
                  <Link key={x ?? "all"} href={x ? `/?c=${x}#places` : "/#places"} scroll={false} aria-current={x === category ? "true" : undefined} className="chip shrink-0">
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
        </section>

        {/* Paper band: the cream of the covers breaks the dark page. */}
        <section className="mt-20 bg-paper text-paper-ink md:mt-28" aria-labelledby="club">
          <div className="px-edge grid items-center gap-8 py-12 md:grid-cols-2 md:gap-12 md:py-16">
            <div className="aspect-[3/2] overflow-hidden rounded-tile-r" style={{ background: CLUB_COVER.bg }}>
              <img src={CLUB_COVER.src} srcSet={CLUB_COVER.srcSet} sizes="(min-width: 768px) 50vw, 100vw" alt="" loading="lazy" className="h-full w-full object-cover" />
            </div>
            <div className="max-w-[32rem]">
              <p className="text-[14px] font-semibold text-paper-ink-3">{C.clubLabel}</p>
              <h2 id="club" className="mt-2 text-[32px] text-paper-ink md:text-[44px]">
                {C.clubTitle}
              </h2>
              <p className="mt-4 text-[17px] text-paper-ink-2">{C.clubText}</p>
              <div className="mt-7 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                <Link href="/join" className="btn btn-ink">
                  {C.clubCta}
                </Link>
                <Link href="/join#partners" className="link-paper text-[15px]">
                  {C.partnerLink}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter t={t} flush />
    </>
  );
}
