import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { Plate } from "@/components/Plate";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes, almatyToday, formatDay } from "@/lib/format";
import { clock } from "@/lib/booking";
import { CLUB_COVER, HERO, MARKET } from "@/lib/covers";
import { CATEGORIES, type Category } from "@/lib/types";
import { CityMap, type MapCity } from "@/components/CityMap";
import plans from "@/lib/cityPlans.generated.json";
import { CITIES, cityKey, placeOnCountry, placeOnPlan, planAspect, planHeightKm, planWidthKm } from "@/lib/cities";

export const dynamic = "force-dynamic";

/**
 * The main page as an annual report (design/dna/annual-reports.json):
 * a cover and its contents page, the catalog as printed plates, a Coca-Cola
 * market photograph with the perks, the club. Sections butt against each
 * other like pages; nothing is rounded or shadowed.
 *
 * Funnel (12 Nov 2026, owner: «продумай воронку ui чтобы все было
 * органично»): every block either moves a guest one step closer to a table
 * or stays out of the way. The cover's contents page used to list
 * categories with counts — a second copy of the filter tabs above the grid —
 * and a Kraftco band under it told the earliest free time without a way to
 * take it. Now the contents page *is* tonight: each place with its nearest
 * free time, and a tap opens the booking with that day and time. The
 * categories live only in the tabs; the Kraftco band stays in the admin.
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

  // The cover's contents: each place at its nearest free time, today first.
  const nearest = all
    .flatMap((v) => {
      const f = free.get(v.id);
      return f ? [{ v, f, at: f.slots[0] }] : [];
    })
    .sort((a, b) => (a.f.day === b.f.day ? a.at - b.at : a.f.day === "today" ? -1 : 1));
  const perks = all.filter((v) => v.perk);

  // The map: per city, the places that have a point inside its plan,
  // numbered in catalog order (the list beside the plan uses the same).
  const mapCities: MapCity[] = CITIES.map((city) => {
    const placed = all.flatMap((v) => {
      if (cityKey(v.city) !== city.key || v.lat == null || v.lng == null) return [];
      const at = placeOnPlan(city, v.lat, v.lng);
      return at ? [{ v, at }] : [];
    });
    return {
      key: city.key,
      name: city.name[lang],
      note: placed.length ? C.mapCount(placed.length) : C.mapSoon,
      soonTitle: C.mapSoonTitle(city.name[lang]),
      aspect: planAspect(city),
      plan: plans[city.key] === true,
      kmX: 100 / planWidthKm(city),
      kmY: 100 / planHeightKm(city),
      onCountry: placeOnCountry(city.centre.lat, city.centre.lng),
      edge: city.key === "almaty" ? C.mapMountains : undefined,
      venues: placed.map(({ v, at }, i) => {
        const f = free.get(v.id);
        return {
          n: i + 1,
          name: v.name,
          category: t.categories[v.category],
          href: `/v/${v.slug}`,
          slot: f ? { label: clock(f.slots[0]), day: (f.day === "today" ? t.booking.today : t.booking.tomorrow).toLowerCase(), href: `/v/${v.slug}?d=${f.date}&t=${f.slots[0]}#book` } : undefined,
          left: at.left,
          top: at.top,
        };
      }),
    };
  });

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* Cover and contents: Heublein 1970 photograph; the contents page lists
            tonight. On phones the photograph is cut to 16:10 so the title and
            the first times are on the first screen. */}
        <section className="px-edge grid gap-8 border-t border-line pb-16 pt-6 md:grid-cols-[5fr_7fr] md:gap-12 md:pb-24 md:pt-10 lg:gap-20">
          <div className="relative overflow-hidden" style={{ background: HERO.bg }}>
            <img src={HERO.src} srcSet={HERO.srcSet} sizes="(min-width: 768px) 42vw, 92vw" alt={C.heroAlt} fetchPriority="high" className="aspect-[16/10] w-full object-cover object-[50%_40%] md:aspect-[4/5] md:h-full" />
            <p className="absolute inset-x-4 bottom-4 flex items-baseline justify-between text-[13px] tracking-[0.02em] text-ink-2">
              <span>Shaqyru, Алматы</span>
              <span className="numerals text-[20px] text-accent">{today.slice(0, 4)}</span>
            </p>
          </div>
          <div className="flex flex-col md:pt-2">
            <p className="label first-letter:uppercase">{formatDay(today, lang, true)}</p>
            <h1 className="mt-3 text-[40px] md:text-[52px]">{C.title}</h1>
            <p className="mt-4 max-w-[34rem] text-[17px] text-ink-2">{C.count(total)}</p>
            {nearest.length ? (
              <>
                <h2 className="label mt-10">{C.nearestTitle}</h2>
                <ul className="mt-2 border-t border-line">
                  {nearest.map(({ v, f, at }) => (
                    <li key={v.id} className="border-b border-line">
                      <Link href={`/v/${v.slug}?d=${f.date}&t=${at}#book`} className="group flex min-h-14 items-center justify-between gap-4 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[17px] font-medium text-ink transition-colors duration-150 group-hover:text-accent">{v.name}</span>
                          <span className="block text-[13px] text-ink-3">
                            {t.categories[v.category]} · {(f.day === "today" ? t.booking.today : t.booking.tomorrow).toLowerCase()}
                          </span>
                        </span>
                        <span className="numerals shrink-0 text-[30px] leading-none text-ink transition-colors duration-150 group-hover:text-accent">{clock(at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </section>

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

        {/* Where Shaqyru is: a survey plate per city and Kazakhstan with both. */}
        <section id="map" className="px-edge scroll-mt-4 pt-16 md:pt-24" aria-labelledby="map-title">
          <CityMap
            title={C.mapTitle}
            cities={mapCities}
            s={{ soonText: C.mapSoonText, soonCta: C.mapSoonCta, credit: C.mapCredit, km: C.mapKm, countryAlt: C.mapCountryAlt, countryCredit: C.mapCountryCredit }}
          />
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
