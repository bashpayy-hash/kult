import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getDict } from "@/lib/i18n";
import { publicImageUrl } from "@/lib/storage";
import { loadPlan, loadVenueView } from "@/lib/venueData";
import { currentRecommender } from "@/lib/blat";
import { isIsoDate } from "@/lib/format";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { VenueView } from "@/components/VenueView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ venue: string }>; searchParams: Promise<{ d?: string; t?: string }> };
const load = cache((slug: string) => loadVenueView({ slug }));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const d = await load((await params).venue);
  if (!d) return { title: "Бөлек" };
  const photo = publicImageUrl(d.photo_path);
  return {
    title: d.venue_name,
    description: d.description || undefined,
    openGraph: { title: `${d.venue_name} · Бөлек`, images: photo ? [photo] : ["/og.png"] },
  };
}

/** Catalog venue page: facts, hours, special offer, floor plan and booking. */
export default async function VenuePage({ params, searchParams }: Props) {
  const d = await load((await params).venue);
  const sp = await searchParams;
  // A time tapped on a catalog card arrives as ?d=YYYY-MM-DD&t=<minutes>.
  const initial = { date: isIsoDate(sp.d) ? sp.d : undefined, slot: /^\d{1,4}$/.test(sp.t ?? "") ? Number(sp.t) : undefined };
  if (!d) notFound();
  const { lang, t } = await getDict();
  const [plan, rec] = await Promise.all([loadPlan(d.venue_id), currentRecommender()]);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <VenueView d={d} lang={lang} t={t} plan={plan} active initial={initial} advise={{ known: rec?.name ?? null }} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
