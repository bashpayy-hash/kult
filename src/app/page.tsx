import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Rail, VenueCard, VenueTile } from "@/components/VenueCard";
import { listedCategories, listVenues } from "@/lib/venueData";
import { CATEGORIES, type Category } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * «Обзор» — the main screen, after the owner's friend's booking app
 * (12 Nov 2026): popular places, places worth a visit by category, special
 * offers. The first screen keeps the iitaly.net composition.
 */
export default async function Overview({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { lang, t } = await getDict();
  const L = t.landing;
  const C = t.catalog;
  const { c } = await searchParams;
  const cats = await listedCategories();
  const category = CATEGORIES.includes(c as Category) && cats.includes(c!) ? (c as Category) : (cats[0] as Category | undefined);
  const [featured, worth, offers] = await Promise.all([
    listVenues({ featured: true, limit: 12 }),
    category ? listVenues({ category, limit: 12 }) : Promise.resolve([]),
    listVenues({ withPerk: true, limit: 12 }),
  ]);

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* iitaly.net composition: full-bleed scene, headline card on the calm half. */}
        <section className="relative">
          <div className="relative h-[62vw] max-h-[520px] min-h-[240px] overflow-hidden bg-tile lg:h-[min(calc(100dvh-80px),720px)] lg:max-h-none lg:min-h-[560px]">
            <img
              src="/illustrations/scenes/hero-1600.webp"
              srcSet="/illustrations/scenes/hero-640.webp 640w, /illustrations/scenes/hero-1024.webp 1024w, /illustrations/scenes/hero-1600.webp 1600w, /illustrations/scenes/hero-2400.webp 2400w"
              sizes="100vw"
              alt={L.heroAlt}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-[28%_60%]"
            />
          </div>
          <div className="px-edge lg:pointer-events-none lg:absolute lg:inset-0 lg:flex lg:items-center lg:justify-end">
            <div className="rise pt-9 lg:pointer-events-auto lg:max-w-[29rem] lg:rounded-tile lg:bg-canvas/88 lg:p-10 lg:shadow-[0_24px_60px_rgb(0_0_0/0.45)]">
              <h1 className="text-[38px] sm:text-[44px] lg:text-[48px]">
                {L.title} <span className="block text-accent">{L.titleAccent}</span>
              </h1>
              <p className="mt-5 max-w-[34rem] text-[17px] text-ink-2">{C.heroLead}</p>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                <a href="#places" className="btn btn-primary w-full sm:w-auto">
                  {C.heroCta}
                </a>
                <Link href="/join" className="link-quiet text-[15px]">
                  {L.member.title}
                </Link>
              </div>
            </div>
          </div>
        </section>

        {featured.length ? (
          <section id="places" className="px-edge scroll-mt-4 pt-20 md:pt-28" aria-labelledby="popular">
            <h2 id="popular" className="mb-6 text-[28px] md:text-[36px]">
              {C.popular}
            </h2>
            <Rail>
              {featured.map((v) => (
                <VenueTile key={v.id} v={v} />
              ))}
            </Rail>
          </section>
        ) : null}

        {cats.length ? (
          <section id="worth" className="px-edge scroll-mt-4 pt-16 md:pt-20" aria-labelledby="worth-title">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="worth-title" className="max-w-[18ch] text-[28px] md:max-w-none md:text-[36px]">
                {C.worth}
              </h2>
              <Link href={category ? `/places?c=${category}` : "/places"} className="btn btn-soft btn-sm shrink-0">
                {C.seeAll}
              </Link>
            </div>
            <Rail>
              {cats.map((x) => (
                <Link
                  key={x}
                  href={`/?c=${x}#worth`}
                  scroll={false}
                  aria-current={x === category ? "true" : undefined}
                  className={`btn shrink-0 ${x === category ? "bg-ink text-canvas" : "btn-soft"}`}
                >
                  {C.plural[x as Category]}
                </Link>
              ))}
            </Rail>
            <div className="mt-4">
              <Rail>
                {worth.map((v) => (
                  <VenueCard key={v.id} v={v} t={t} lang={lang} />
                ))}
              </Rail>
            </div>
          </section>
        ) : null}

        {offers.length ? (
          <section className="px-edge pt-16 md:pt-20" aria-labelledby="offers">
            <h2 id="offers" className="mb-6 text-[28px] md:text-[36px]">
              {C.offers}
            </h2>
            <Rail>
              {offers.map((v) => (
                <VenueCard key={v.id} v={v} t={t} lang={lang} perk />
              ))}
            </Rail>
          </section>
        ) : null}

        <section className="px-edge pt-16 md:pt-24" aria-labelledby="club">
          <div className="flex flex-col gap-6 rounded-tile-r bg-tile p-6 sm:p-8 md:flex-row md:items-end md:justify-between md:p-12">
            <div className="max-w-[36rem]">
              <h2 id="club" className="text-[28px] md:text-[36px]">
                {C.clubTitle}
              </h2>
              <p className="mt-3 text-ink-2">{C.clubText}</p>
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
