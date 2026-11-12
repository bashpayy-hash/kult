import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { NumeralBand } from "@/components/NumeralBand";
import { Plate } from "@/components/Plate";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes, almatyToday, formatDay } from "@/lib/format";
import { clock } from "@/lib/booking";
import { CLUB_COVER, HERO, MARKET } from "@/lib/covers";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * The main page as an annual report (design/dna/annual-reports.json):
 * a cover and its contents page, a Kraftco highlights band, the catalog as
 * printed plates, a Coca-Cola market photograph with the perks, the club.
 * Sections butt against each other like pages; nothing is rounded or shadowed.
 */
export default async function Overview({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { lang, t } = await getDict();
  const C = t.catalog;
  const { c } = await searchParams;
  const category = CATEGORIES.includes(c as Category) ? (c as Category) : null;
  const [cats, all] = await Promise.all([listedCategories(), listVenues()]);
  const list = category ? all.filter((v) => v.category === category) : all;
  const free = await nextFreeSlots(all, 2, 3);
  const total = cats.reduce((s, x) => s + x.n, 0);
  const nowMin = almatyNowMinutes();
  const today = almatyToday();

  // Today's window: the earliest free time and the latest one, across places.
  const todays = all.flatMap((v) => {
    const f = free.get(v.id);
    return f && f.day === "today" ? [{ v, first: f.slots[0] }] : [];
  });
  const first = todays.slice().sort((a, b) => a.first - b.first)[0];
  const lastSlot = Math.max(
    ...all.map((v) => {
      const open = Number(v.open_time.slice(0, 2)) * 60 + Number(v.open_time.slice(3, 5));
      let close = Number(v.close_time.slice(0, 2)) * 60 + Number(v.close_time.slice(3, 5));
      if (close <= open) close += 1440;
      return close - 60;
    }),
  );
  const perks = all.filter((v) => v.perk);
  const numerals: [string, string] = first ? [clock(first.first), clock(lastSlot)] : [today.slice(8, 10), today.slice(5, 7)];

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* Cover and contents: Heublein 1970 photograph, title set small on it. */}
        <section className="px-edge grid gap-8 border-t border-line pb-16 pt-6 md:grid-cols-[5fr_7fr] md:gap-12 md:pb-24 md:pt-10 lg:gap-20">
          <div className="relative overflow-hidden" style={{ background: HERO.bg }}>
            <img src={HERO.src} srcSet={HERO.srcSet} sizes="(min-width: 768px) 42vw, 92vw" alt={C.heroAlt} fetchPriority="high" className="aspect-[4/5] h-full w-full object-cover" />
            <p className="absolute inset-x-4 bottom-4 flex items-baseline justify-between text-[13px] tracking-[0.02em] text-ink-2">
              <span>Shaqyru, {lang === "kk" ? "Алматы" : "Алматы"}</span>
              <span className="numerals text-[18px] text-accent">{today.slice(0, 4)}</span>
            </p>
          </div>
          <div className="flex flex-col md:pt-2">
            <h1 className="text-[40px] md:text-[52px]">{C.title}</h1>
            <p className="mt-4 max-w-[34rem] text-[17px] text-ink-2">{C.count(total)}</p>
            <h2 className="mt-10 text-[13px] font-medium tracking-[0.02em] text-ink-3">{C.contents}</h2>
            <ul className="mt-2 border-t border-line">
              {cats.map((x) => (
                <li key={x.category} className="border-b border-line">
                  <Link href={`/?c=${x.category}#places`} className="flex min-h-12 items-baseline justify-between gap-4 py-3 text-[17px] text-ink transition-colors duration-150 hover:text-accent">
                    <span>{C.plural[x.category as Category]}</span>
                    <span className="numerals text-[22px] text-ink-3">{x.n}</span>
                  </Link>
                </li>
              ))}
              {perks.length ? (
                <li className="border-b border-line">
                  <a href="#perks" className="flex min-h-12 items-baseline justify-between gap-4 py-3 text-[17px] text-ink transition-colors duration-150 hover:text-accent">
                    <span>{C.perksTitle}</span>
                    <span className="numerals text-[22px] text-ink-3">{perks.length}</span>
                  </a>
                </li>
              ) : null}
              <li className="border-b border-line">
                <Link href="/join" className="flex min-h-12 items-baseline justify-between gap-4 py-3 text-[17px] text-ink transition-colors duration-150 hover:text-accent">
                  <span>{C.clubTitle}</span>
                </Link>
              </li>
            </ul>
          </div>
        </section>

        {/* Kraftco 1972: today's window, from the first free time to the last. */}
        <NumeralBand numerals={numerals}>
          <p className="text-[13px] font-medium tracking-[0.02em] text-ink-3">{C.today}</p>
          <h2 className="mt-2 text-[34px] text-ink first-letter:uppercase md:text-[44px]">{formatDay(today, lang, true)}</h2>
          <p className="mt-4 text-[17px] text-ink-2">
            {first ? `${C.freeSpan(clock(first.first), clock(lastSlot))} ${C.earliest(clock(first.first), first.v.name)}` : C.freeSummary(0, total)}
          </p>
        </NumeralBand>

        <section id="places" className="px-edge scroll-mt-4 pb-6 pt-16 md:pt-24" aria-labelledby="places-title">
          <div className="flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
            <h2 id="places-title" className="text-[28px] md:text-[36px]">
              {C.placesTitle}
            </h2>
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
          </div>
          {list.length === 0 ? (
            <p className="mt-10 text-ink-3">{C.empty}</p>
          ) : (
            <ul className="mt-8 grid gap-x-6 gap-y-14 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((v) => (
                <li key={v.id}>
                  <VenueCard v={v} t={t} lang={lang} free={free.get(v.id)} nowMin={nowMin} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Coca-Cola 1987: one market photograph; the perks as a ruled list. */}
        {perks.length ? (
          <section id="perks" className="mt-16 scroll-mt-4 border-t border-line md:mt-24" aria-labelledby="perks-title">
            <div className="grid md:grid-cols-[7fr_5fr]">
              <div className="relative" style={{ background: MARKET.bg }}>
                <img src={MARKET.src} srcSet={MARKET.srcSet} sizes="(min-width: 768px) 58vw, 100vw" alt={C.marketAlt} loading="lazy" className="aspect-[3/2] h-full w-full object-cover" />
              </div>
              <div className="px-edge py-10 md:!px-10 md:py-14 lg:!px-14">
                <h2 id="perks-title" className="text-[28px] md:text-[36px]">
                  {C.perksTitle}
                </h2>
                <p className="mt-2 text-[15px] text-ink-3">{C.perksLead}</p>
                <ul className="mt-6 border-t border-line">
                  {perks.map((v) => (
                    <li key={v.id} className="border-b border-line">
                      <Link href={`/v/${v.slug}`} className="flex min-h-12 flex-col gap-0.5 py-3 transition-colors duration-150 hover:text-accent">
                        <span className="text-[16px] font-semibold text-ink">{v.name}</span>
                        <span className="text-[15px] text-ink-2">{(lang === "kk" && v.perk_kk) || v.perk}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        ) : null}

        {/* The club on paper. */}
        <section className="bg-paper text-paper-ink" aria-labelledby="club">
          <div className="px-edge grid items-center gap-8 py-14 md:grid-cols-[4fr_8fr] md:gap-16 md:py-20">
            <div className="max-w-[20rem]">
              <Plate src={CLUB_COVER.src} srcSet={CLUB_COVER.srcSet} sizes="(min-width: 768px) 28vw, 80vw" bg={CLUB_COVER.bg} />
            </div>
            <div className="max-w-[34rem]">
              <p className="text-[13px] font-medium tracking-[0.02em] text-paper-ink-3">{C.clubLabel}</p>
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
