import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard } from "@/components/VenueCard";
import { Plate } from "@/components/Plate";
import { listedCategories, listVenues, nextFreeSlots } from "@/lib/venueData";
import { almatyNowMinutes, almatyToday, formatDay } from "@/lib/format";
import { clock } from "@/lib/booking";
import { CLUB_COVER, COVER, MARKET } from "@/lib/covers";
import { CATEGORIES, type Category } from "@/lib/types";
import { CityMap, type MapCity } from "@/components/CityMap";
import { Tick } from "@/components/Tick";
import plans from "@/lib/cityPlans.generated.json";
import almatyPlan from "@/lib/almatyPlan.generated.json";
import almatyTiles from "../../public/maps/almaty/tiles/tiles.json";
import type { PlanLandmark, PlanLayers } from "@/components/PlanCamera";
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
  // The detailed Almaty plan (scripts/draw-almaty-plan.py): layers and labels in the page's language.
  const pick = (o: { ru: string; kk: string }) => (lang === "kk" ? o.kk : o.ru);
  const almatyCity = CITIES.find((c) => c.key === "almaty")!;
  const almatyLayers: PlanLayers = {
    tiles: { url: "/maps/almaty/tiles/", ...almatyTiles },
    avenues: almatyPlan.avenues.map((a) => ({ t: pick(a), x: a.x, y: a.y, a: a.a })),
    districts: almatyPlan.districts.map((d) => ({ t: pick(d), x: d.x, y: d.y })),
    landmarks: almatyPlan.landmarks.map((l) => ({ k: l.k as PlanLandmark["k"], t: pick(l), x: l.x, y: l.y })),
    contours: almatyPlan.contours.map((c) => ({ t: `${c.t} ${C.mapM}`, x: c.x, y: c.y, a: c.a })),
    range: { t: C.mapMountains, x: 63, y: 96.5, a: -6 },
    widthM: planWidthKm(almatyCity) * 1000,
  };
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
      layers: city.key === "almaty" ? almatyLayers : undefined,
      venues: placed.map(({ v, at }, i) => {
        const f = free.get(v.id);
        return {
          n: i + 1,
          name: v.name,
          category: t.categories[v.category],
          kind: v.category,
          lat: v.lat!,
          lng: v.lng!,
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
        {/* The cover (15 Nov 2026, owner: «иллюстрация классная, но не под лендинг… нужно
            брать ещё что-то сильнее», then «что-то в стиле более презентабельном»):
            full-bleed, an editorial photograph of an evening out in Almaty, the title set
            over it, two ways in — the nearest free time or the map (the free 3D walk left
            on 15 Nov 2026: «Свободного перемещения по карте не будет»). The contents
            (tonight's times) follow straight under it. */}
        <section aria-labelledby="hero-title" className="relative isolate overflow-hidden border-t border-line" style={{ background: COVER.bg }}>
          <picture>
            <source media="(min-width: 768px)" srcSet={COVER.wide.srcSet} sizes="100vw" />
            {/* Phone: the picture fills the top of the screen and the faces stay clear; the
                title sits below them, where the table fades into the page. Computer: full-bleed,
                the title on the darker left. */}
            <img src={COVER.tall.src} srcSet={COVER.tall.srcSet} sizes="100vw" alt={C.coverAlt} fetchPriority="high" className="absolute inset-x-0 top-0 h-[62svh] w-full object-cover object-top md:inset-0 md:h-full md:object-[50%_40%]" />
          </picture>
          {/* Ink rises from the foot of the picture so the title reads on any frame. */}
          <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(35,25,23,0)_30svh,rgba(35,25,23,0.7)_45svh,rgba(35,25,23,1)_61svh)] md:bg-[linear-gradient(to_bottom,rgba(35,25,23,0)_16%,rgba(35,25,23,0.5)_42%,rgba(35,25,23,0.86)_70%,rgba(35,25,23,1)_100%)]" />
          <div className="px-edge relative flex flex-col justify-end pb-8 pt-[43svh] md:min-h-[84vh] md:pb-14 md:pt-28">
            <p className="enter label text-ink first-letter:uppercase" style={{ ["--i" as string]: 0 }}>{formatDay(today, lang, true)}</p>
            <h1 id="hero-title" className="enter mt-3 max-w-[12ch] text-[52px] leading-[0.98] tracking-[-0.035em] text-ink md:text-[96px]" style={{ ["--i" as string]: 1 }}>{C.title}</h1>
            <p className="enter mt-4 max-w-[34rem] text-[17px] text-ink-2 md:text-[19px]" style={{ ["--i" as string]: 2 }}>{C.count(total)}</p>
            <div className="enter mt-6 flex flex-wrap gap-2.5 md:mt-7 md:gap-3" style={{ ["--i" as string]: 3 }}>
              <a href={nearest.length ? "#nearest" : "#places"} className="btn btn-primary">{C.heroCta}</a>
              <a href="#map" className="btn btn-soft">{C.mapTitle}</a>
            </div>
          </div>
        </section>

        {nearest.length ? (
          <section id="nearest" aria-labelledby="nearest-title" className="px-edge scroll-mt-4 pb-6 pt-10 md:pt-14">
            <div className="max-w-[44rem]">
                {/* A small label over the list, not a section heading: the list is named by it. */}
                <p id="nearest-title" className="enter label" style={{ ["--i" as string]: 4 }}>{C.nearestTitle}</p>
                <ul aria-labelledby="nearest-title" className="mt-2 border-t border-line">
                  {nearest.map(({ v, f, at }, k) => (
                    <li key={v.id} className="enter border-b border-line" style={{ ["--i" as string]: 5 + k }}>
                      <Link href={`/v/${v.slug}?d=${f.date}&t=${at}#book`} className="group flex min-h-14 items-center justify-between gap-4 py-2.5">
                        <span className="min-w-0">
                          <span className="block truncate text-[17px] font-medium text-ink transition-colors duration-150 group-hover:text-accent">{v.name}</span>
                          <span className="block text-[13px] text-ink-3">
                            {t.categories[v.category]} · {(f.day === "today" ? t.booking.today : t.booking.tomorrow).toLowerCase()}
                          </span>
                        </span>
                        {/* The board ticks in after its row: row delay + 200 ms. */}
                        <Tick text={clock(at)} delay={Math.min(5 + k, 8) * 35 + 200} className="numerals shrink-0 text-[30px] leading-none text-ink transition-colors duration-150 group-hover:text-accent" />
                      </Link>
                    </li>
                  ))}
                </ul>
            </div>
          </section>
        ) : null}

        <section id="places" className="px-edge scroll-mt-4 pb-6 pt-16 md:pt-24" aria-labelledby="places-title">
          <div className="reveal flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
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
              {list.map((v, k) => (
                <li key={v.id} className="reveal" style={{ ["--c" as string]: k % 3 }}>
                  <VenueCard v={v} t={t} lang={lang} free={free.get(v.id)} nowMin={nowMin} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Where бөлек is: a survey plate per city and Kazakhstan with both. */}
        <section id="map" className="px-edge scroll-mt-4 pt-16 md:pt-24" aria-labelledby="map-title">
          <CityMap
            title={C.mapTitle}
            cities={mapCities}
            lang={lang}
            s={{
              soonText: C.mapSoonText, soonCta: C.mapSoonCta, credit: C.mapCredit, km: C.mapKm, countryAlt: C.mapCountryAlt, countryCredit: C.mapCountryCredit, showOnMap: C.mapShow,
              camera: { zoomIn: C.mapZoomIn, zoomOut: C.mapZoomOut, whole: C.mapWhole, aria: C.mapAria, close: C.mapClose, open: C.mapOpen, north: C.mapNorth, m: C.mapM, km: C.mapKm, hint: C.mapHint, twoFingers: C.mapTwoFingers },
            }}
          />
        </section>

        {/* Coca-Cola 1987: one market photograph; the perks as a ruled list. */}
        {perks.length ? (
          <section id="perks" className="mt-16 scroll-mt-4 border-t border-line md:mt-24" aria-labelledby="perks-title">
            <div className="grid md:grid-cols-[7fr_5fr]">
              <div className="reveal relative" style={{ background: MARKET.bg }}>
                <img src={MARKET.src} srcSet={MARKET.srcSet} sizes="(min-width: 768px) 58vw, 100vw" alt={C.marketAlt} loading="lazy" className="aspect-[3/2] h-full w-full object-cover" />
              </div>
              <div className="reveal px-edge py-10 md:!px-10 md:py-14 lg:!px-14" style={{ ["--c" as string]: 1 }}>
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

        {/* Blat (16 Nov 2026): anyone recommends a place, a visit the hostess
            confirmed earns a point per guest, points buy treats, never money. */}
        <section className="px-edge border-t border-line py-14 md:py-20" aria-labelledby="blat-title">
          <div className="grid gap-8 md:grid-cols-[5fr_7fr] md:gap-12">
            <div className="reveal max-w-[30rem]">
              <p className="label">{t.blat.adviseTitle}</p>
              <h2 id="blat-title" className="mt-2 text-[32px] md:text-[44px]">{t.blat.title}</h2>
              <p className="mt-4 text-[17px] text-ink-2">{t.blat.lead}</p>
              <Link href="/blat" className="btn btn-soft mt-7">{t.blat.howTitle} →</Link>
            </div>
            <ol className="reveal grid content-start gap-3" style={{ ["--c" as string]: 1 }}>
              {t.blat.how.map((step, i) => (
                <li key={i} className="flex gap-4 bg-raised px-5 py-4 text-[15px] text-ink-2">
                  <span className="numerals text-[32px] leading-none text-accent">{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* The club on paper. */}
        <section className="bg-paper text-paper-ink" aria-labelledby="club">
          <div className="px-edge grid items-center gap-8 py-14 md:grid-cols-[4fr_8fr] md:gap-16 md:py-20">
            <div className="reveal max-w-[20rem]">
              <Plate src={CLUB_COVER.src} srcSet={CLUB_COVER.srcSet} sizes="(min-width: 768px) 28vw, 80vw" bg={CLUB_COVER.bg} />
            </div>
            <div className="reveal max-w-[34rem]" style={{ ["--c" as string]: 1 }}>
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
