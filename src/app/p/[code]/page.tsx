import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { cache } from "react";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { publicImageUrl } from "@/lib/storage";
import { loadPlan, loadVenueView } from "@/lib/venueData";
import { currentRecommender } from "@/lib/blat";
import { getVisitor } from "@/lib/visitor";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { VenueView } from "@/components/VenueView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ code: string }> };

const loadPick = cache(async (code: string) => {
  if (!/^[a-z0-9]{6,12}$/.test(code)) return null;
  const [p] = await db()<{ id: string; venue_id: string; note: string | null; name: string }[]>`
    select p.id, p.venue_id, p.note, r.name from picks p join recommenders r on r.id = p.recommender_id
    where p.code = ${code} and p.active`;
  if (!p) return null;
  const d = await loadVenueView({ id: p.venue_id });
  return d ? { pick: p, d } : null;
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const x = await loadPick((await params).code);
  if (!x) return { title: "Бөлек" };
  const photo = publicImageUrl(x.d.photo_path);
  const { t } = await getDict();
  return {
    title: `${x.d.venue_name} · ${t.blat.pickFrom(x.pick.name)}`,
    description: x.pick.note || x.d.description || undefined,
    robots: { index: false },
    openGraph: { title: `${x.d.venue_name} · Бөлек`, description: t.blat.pickFrom(x.pick.name), images: photo ? [photo] : ["/og.png"] },
  };
}

/** A friend's recommendation: the venue page, with who recommends it and why. */
export default async function PickPage({ params }: Props) {
  const x = await loadPick((await params).code);
  if (!x) notFound();
  const { lang, t } = await getDict();
  const [plan, rec, v] = await Promise.all([loadPlan(x.d.venue_id, lang), currentRecommender(), getVisitor()]);
  // Opens are counted for the recommender's page; after the response, never for prefetches.
  if (!v.isPrefetch) {
    after(async () => {
      try {
        await db()`insert into pick_opens (pick_id, visitor_hash, is_bot) values (${x.pick.id}, ${v.hash}, ${v.isBot})`;
      } catch (e) {
        console.error("pick open not logged", e);
      }
    });
  }
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <VenueView d={x.d} lang={lang} t={t} plan={plan} active pick={{ id: x.pick.id, name: x.pick.name, note: x.pick.note }} advise={{ known: rec?.name ?? null }} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
