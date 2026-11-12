import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { VenueViewData } from "@/components/VenueView";

export type InviteData = VenueViewData & {
  link_id: string;
  link_active: boolean;
  code_phrase: string | null;
  member_name: string;
  member_slug: string;
  member_active: boolean;
  venue_slug: string;
  venue_active: boolean;
};

const SLUG = /^[a-z0-9][a-z0-9-]{1,39}$/;

type Row = Omit<InviteData, "hours"> & { open_time: string; close_time: string; slot_minutes: number; hold_minutes: number };

/** cache(): generateMetadata and the page share one query per request. */
export const loadInvite = cache(async (member: string, venue: string): Promise<InviteData | null> => {
  if (!SLUG.test(member) || !SLUG.test(venue)) return null;
  const [row] = await db()<Row[]>`
    select tl.id as link_id, tl.active as link_active, tl.code_phrase,
           m.name as member_name, m.slug as member_slug, m.status = 'active' as member_active,
           v.id as venue_id, v.name as venue_name, v.slug as venue_slug, v.status = 'active' as venue_active,
           v.category, v.description, v.description_kk, v.address, v.instagram, v.photo_path,
           v.open_time::text, v.close_time::text, v.slot_minutes, v.hold_minutes,
           case when o.active then o.guest_perk end as perk,
           case when o.active then o.guest_perk_kk end as perk_kk,
           case when o.active then o.terms end as terms
    from tracking_links tl
    join members m on m.id = tl.member_id
    join venues v on v.id = tl.venue_id
    left join offers o on o.id = tl.offer_id
    where m.slug = ${member} and v.slug = ${venue}`;
  if (!row) return null;
  const { open_time, close_time, slot_minutes, hold_minutes, ...rest } = row;
  return { ...rest, hours: { open_time, close_time, slot_minutes, hold_minutes } };
});
