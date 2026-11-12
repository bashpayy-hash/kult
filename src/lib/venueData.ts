import "server-only";
import { db } from "./db";
import { fits, isFree, LEAD_MINUTES, slotList, type PlanHall, type PlanItem, type Taken } from "./booking";
import { almatyToday, earliestStart, shiftDate } from "./format";

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
  city: string;
  lat: number | null;
  lng: number | null;
  photo_path: string | null;
  logo_path: string | null;
  avg_check: number | null;
  featured: boolean;
  perk: string | null;
  perk_kk: string | null;
  open_time: string;
  close_time: string;
  slot_minutes: number;
  hold_minutes: number;
};

/** Listed, active venues for the catalog, each with its first active guest perk. */
export async function listVenues(opts: { category?: string | null; limit?: number } = {}): Promise<CatalogVenue[]> {
  const category = opts.category ?? null;
  return db()<CatalogVenue[]>`
    select v.id, v.slug, v.name, v.category, v.address, v.city, v.lat, v.lng, v.photo_path, v.logo_path, v.avg_check, v.featured,
           v.open_time::text, v.close_time::text, v.slot_minutes, v.hold_minutes,
           o.guest_perk as perk, o.guest_perk_kk as perk_kk
    from venues v
    left join lateral (
      select guest_perk, guest_perk_kk from offers
      where venue_id = v.id and active and guest_perk is not null
      order by created_at limit 1
    ) o on true
    where v.status = 'active' and v.is_listed
      and (${category}::text is null or v.category = ${category})
    order by v.featured desc, v.name
    limit ${opts.limit ?? 100}`;
}

/** Categories that have at least one listed venue, in the canonical order, with counts. */
export async function listedCategories(): Promise<{ category: string; n: number }[]> {
  const rows = await db()<{ category: string; n: number }[]>`
    select category, count(*)::int as n from venues where status = 'active' and is_listed group by category`;
  const order = ["restaurant", "cafe", "bar", "beauty", "wellness", "fitness", "other"];
  return order.flatMap((c) => rows.filter((r) => r.category === c));
}

export type FreeSlots = { date: string; day: "today" | "tomorrow"; slots: number[] };

/**
 * The next few bookable times for each venue, for a party of `party`: today
 * if anything is left, otherwise tomorrow. Two queries for the whole list.
 */
export async function nextFreeSlots(venues: CatalogVenue[], party = 2, count = 3): Promise<Map<string, FreeSlots>> {
  const out = new Map<string, FreeSlots>();
  if (!venues.length) return out;
  const ids = venues.map((v) => v.id);
  const today = almatyToday();
  const sql = db();
  const [tables, rows] = await Promise.all([
    sql<(PlanItem & { venue_id: string })[]>`
      select id, hall_id, kind, label, shape, x::float8 as x, y::float8 as y, w::float8 as w, h::float8 as h, seats_min, seats_max, venue_id
      from venue_tables where venue_id = any(${ids}::uuid[]) and active and kind = 'table'`,
    sql<{ venue_id: string; table_id: string; from_min: number; hold_minutes: number }[]>`
      select venue_id, table_id, (extract(epoch from (starts_at - ${today}::date::timestamp)) / 60)::int as from_min, hold_minutes
      from guest_bookings
      where venue_id = any(${ids}::uuid[]) and table_id is not null and status in ('new', 'arrived')
        and starts_at >= ${today}::date - interval '8 hours' and starts_at < ${today}::date + interval '3 days'`,
  ]);
  for (const v of venues) {
    const own = tables.filter((t) => t.venue_id === v.id);
    for (const [day, offset] of [["today", 0], ["tomorrow", 1440]] as const) {
      // Taken intervals relative to this service day's midnight.
      const taken: Taken[] = rows.filter((r) => r.venue_id === v.id).map((r) => ({ table_id: r.table_id, from: r.from_min - offset, to: r.from_min - offset + r.hold_minutes }));
      const date = day === "today" ? today : shiftDate(today, 1);
      const earliest = earliestStart(date, LEAD_MINUTES);
      const slots = slotList(v)
        .filter((m) => m >= earliest)
        .filter((m) => own.length === 0 || own.some((t) => fits(t, party) && isFree(t.id, m, v.hold_minutes, taken)))
        .slice(0, count);
      if (slots.length) {
        out.set(v.id, { date, day, slots });
        break;
      }
    }
  }
  return out;
}
