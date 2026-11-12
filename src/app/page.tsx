import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes } from "@/lib/format";
import { CATEGORIES, type Category } from "@/lib/types";
import { CLUB_COVER } from "@/lib/covers";
import { NumeralBand } from "@/components/NumeralBand";
import { almatyToday, formatDay } from "@/lib/format";
import { clock } from "@/lib/booking";

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
  const [cats, all] = await Promise.all([listedCategories(), listVenues()]);
  const list = category ? all.filter((v) => v.category === category) : all;
  const free = await nextFreeSlots(all);
  const total = cats.reduce((s, x) => s + x.n, 0);
  const nowMin = almatyNowMinutes();
  const today = almatyToday();
  // «Сегодня»: how many places still have a time today, and the earliest one.
  const todays = all.flatMap((v) => {
    const f = free.get(v.id);
    return f && f.day === "today" ? [{ v, at: f.slots[0] }] : [];
  });
  const earliest = todays.sort((a, b) => a.at - b.at)[0];
  const perks = all.filter((v) => v.perk);

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

        {/* Kraftco 1972: today's date in enormous translucent numerals. */}
        <NumeralBand numerals={[today.slice(8, 10), today.slice(5, 7)]} className="mt-16 md:mt-24">
          <p className="text-[14px] font-semibold text-paper/70">{C.today}</p>
          <h2 className="mt-2 text-[34px] text-paper first-letter:uppercase md:text-[44px] lg:text-[56px]">{formatDay(today, lang, true)}</h2>
          <p className="mt-4 text-[17px] text-paper/85">
            {C.freeSummary(todays.length, total)}
            {earliest ? ` ${C.earliest(clock(earliest.at), earliest.v.name)}` : ""}
          </p>
        </NumeralBand>

        <section id="places" className="px-edge scroll-mt-4 pt-12 md:pt-16" aria-label={C.title}>
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

        {/* Coca-Cola 1987: a warm full-bleed market collage; the perks list
            sits on a paper card (on phones, below the picture). */}
        {perks.length ? (
          <section className="relative mt-20 md:mt-28" aria-labelledby="perks">
            <div className="relative aspect-[4/3] overflow-hidden bg-[#b5462a] sm:aspect-[21/9]">
              <img
                src="/covers/market-1400.webp"
                srcSet="/covers/market-800.webp 800w, /covers/market-1400.webp 1400w, /covers/market-2200.webp 2200w"
                sizes="100vw"
                alt={C.marketAlt}
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover object-[30%_50%]"
              />
            </div>
            <div className="bg-paper text-paper-ink lg:absolute lg:right-[max(32px,calc((100%-1216px)/2))] lg:top-1/2 lg:w-[26rem] lg:-translate-y-1/2 lg:rounded-tile lg:shadow-[0_24px_60px_rgb(0_0_0/0.35)]">
              <div className="px-edge py-8 lg:px-8 lg:py-8">
                <h2 id="perks" className="text-[28px] text-paper-ink md:text-[32px]">
                  {C.perksTitle}
                </h2>
                <p className="mt-2 text-[15px] text-paper-ink-2">{C.perksLead}</p>
                <ul className="mt-5 divide-y divide-paper-line border-y border-paper-line">
                  {perks.map((v) => (
                    <li key={v.id}>
                      <Link href={`/v/${v.slug}`} className="flex min-h-11 flex-col gap-0.5 py-3 transition-opacity duration-150 hover:opacity-75">
                        <span className="text-[16px] font-semibold text-paper-ink">{v.name}</span>
                        <span className="text-[15px] text-paper-ink-2">{(lang === "kk" && v.perk_kk) || v.perk}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {/* Paper band: the cream of the covers breaks the dark page. */}
        <section className="mt-16 bg-paper text-paper-ink md:mt-28" aria-labelledby="club">
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
