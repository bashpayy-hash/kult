import "server-only";
import { db } from "./db";
import type { PlanHall, PlanItem, Taken } from "./booking";

export async function loadPlan(venueId: string): Promise<{ halls: PlanHall[]; items: PlanItem[] }> {
  const sql = db();
  const [halls, items] = await Promise.all([
    sql<PlanHall[]>`select id, name, name_kk, width, height from venue_halls where venue_id = ${venueId} order by sort, created_at`,
    sql<PlanItem[]>`
      select id, hall_id, kind, label, shape, x::float8 as x, y::float8 as y, w::float8 as w, h::float8 as h, seats_min, seats_max
      from venue_tables where venue_id = ${venueId} and active order by kind desc, label`,
  ]);
  return { halls, items };
}

/**
 * Live table bookings around a service day, as minutes from its midnight.
 * Window: from 8 h before (a late booking yesterday can still hold a table)
 * to the end of the next calendar day (after-midnight slots).
 */
export async function loadTaken(venueId: string, serviceDate: string, exceptBookingId?: string): Promise<Taken[]> {
  const rows = await db()<{ table_id: string; from_min: number; hold_minutes: number }[]>`
    select table_id,
           (extract(epoch from (starts_at - ${serviceDate}::date::timestamp)) / 60)::int as from_min,
           hold_minutes
    from guest_bookings
    where venue_id = ${venueId} and table_id is not null and status in ('new', 'arrived')
      and id is distinct from ${exceptBookingId ?? null}
      and starts_at >= ${serviceDate}::date - interval '8 hours'
      and starts_at <  ${serviceDate}::date + interval '2 days'`;
  return rows.map((r) => ({ table_id: r.table_id, from: r.from_min, to: r.from_min + r.hold_minutes }));
}

export type CatalogVenue = {
  id: string;
  slug: string;
  name: string;
  category: import("./types").Category;
  address: string | null;
  photo_path: string | null;
  featured: boolean;
  perk: string | null;
  perk_kk: string | null;
};

/** Listed, active venues for the catalog, each with its first active guest perk. */
export async function listVenues(opts: { category?: string | null; featured?: boolean; withPerk?: boolean; limit?: number } = {}): Promise<CatalogVenue[]> {
  const category = opts.category ?? null;
  return db()<CatalogVenue[]>`
    select v.id, v.slug, v.name, v.category, v.address, v.photo_path, v.featured,
           o.guest_perk as perk, o.guest_perk_kk as perk_kk
    from venues v
    left join lateral (
      select guest_perk, guest_perk_kk from offers
      where venue_id = v.id and active and guest_perk is not null
      order by created_at limit 1
    ) o on true
    where v.status = 'active' and v.is_listed
      and (${category}::text is null or v.category = ${category})
      and (not ${opts.featured ?? false} or v.featured)
      and (not ${opts.withPerk ?? false} or o.guest_perk is not null)
    order by v.featured desc, v.created_at desc
    limit ${opts.limit ?? 60}`;
}

/** Categories that have at least one listed venue, in the canonical order. */
export async function listedCategories(): Promise<string[]> {
  const rows = await db()<{ category: string }[]>`select distinct category from venues where status = 'active' and is_listed`;
  const order = ["restaurant", "cafe", "bar", "beauty", "wellness", "fitness", "other"];
  return order.filter((c) => rows.some((r) => r.category === c));
}
