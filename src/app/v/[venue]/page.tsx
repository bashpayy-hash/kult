import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { publicImageUrl } from "@/lib/storage";
import { loadPlan } from "@/lib/venueData";
import { isIsoDate } from "@/lib/format";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { VenueView, type VenueViewData } from "@/components/VenueView";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ venue: string }>; searchParams: Promise<{ d?: string; t?: string }> };
type Row = Omit<VenueViewData, "hours"> & { open_time: string; close_time: string; slot_minutes: number; hold_minutes: number };

const load = cache(async (slug: string): Promise<VenueViewData | null> => {
  if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(slug)) return null;
  const [row] = await db()<Row[]>`
    select v.id as venue_id, v.name as venue_name, v.category, v.description, v.description_kk, v.address, v.city, v.lat, v.lng,
           v.instagram, v.photo_path, v.logo_path, v.avg_check, v.open_time::text, v.close_time::text, v.slot_minutes, v.hold_minutes,
           o.guest_perk as perk, o.guest_perk_kk as perk_kk, o.terms
    from venues v
    left join lateral (
      select guest_perk, guest_perk_kk, terms from offers
      where venue_id = v.id and active and guest_perk is not null order by created_at limit 1
    ) o on true
    where v.slug = ${slug} and v.status = 'active' and v.is_listed`;
  if (!row) return null;
  const { open_time, close_time, slot_minutes, hold_minutes, ...rest } = row;
  return { ...rest, hours: { open_time, close_time, slot_minutes, hold_minutes } };
});

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
  const plan = await loadPlan(d.venue_id);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <VenueView d={d} lang={lang} t={t} plan={plan} active initial={initial} />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
