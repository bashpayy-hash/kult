import "server-only";
import { randomBytes, randomInt } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "./db";
import type { Category } from "./types";

// Blat (16 Nov 2026, owner: «overall систему бронирования с системой блата…
// каждый будет делиться своими пиками»). Anyone can recommend a place by a
// personal link; when the hostess marks a friend who came through it, the
// recommender gets a point per guest. Points buy treats a venue chose, never
// money. No login: a long secret in a cookie (and in a private link) is the
// recommender's key.

export const BLAT_COOKIE = "blat";
/** A big table does not turn into a jackpot: at most this many points a booking. */
export const MAX_POINTS_PER_BOOKING = 6;
const COOKIE_AGE = 60 * 60 * 24 * 400;

export type Recommender = { id: string; name: string; phone: string; secret: string };

export const newSecret = () => randomBytes(24).toString("base64url");
export const newPickCode = () => Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[randomInt(31)]).join("");
export const newRedeemCode = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

const SECRET_RE = /^[A-Za-z0-9_-]{24,64}$/;

export async function recommenderBySecret(secret: string | null | undefined): Promise<Recommender | null> {
  if (!secret || !SECRET_RE.test(secret)) return null;
  const [r] = await db()<Recommender[]>`select id, name, phone, secret from recommenders where secret = ${secret}`;
  return r ?? null;
}

/** The recommender this browser belongs to, if any. */
export async function currentRecommender(): Promise<Recommender | null> {
  const jar = await cookies();
  return recommenderBySecret(jar.get(BLAT_COOKIE)?.value);
}

export async function rememberRecommender(secret: string): Promise<void> {
  const jar = await cookies();
  jar.set(BLAT_COOKIE, secret, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: COOKIE_AGE });
}

export type BlatPick = {
  id: string;
  code: string;
  note: string | null;
  venue_name: string;
  venue_slug: string;
  category: Category;
  opens: number;
  bookings: number;
  /** Guests the hostess marked as came. */
  guests: number;
  points: number;
};
export type BlatReward = { id: string; title: string; title_kk: string | null; cost: number; venue_id: string; venue_name: string; venue_slug: string };
export type BlatCode = { id: string; code: string; status: "issued" | "used"; title: string; title_kk: string | null; venue_name: string; created_at: string };
export type BlatEntry = { delta: number; reason: "visit" | "redeem" | "adjust"; venue_name: string | null; created_at: string };

export type Dashboard = { balance: number; picks: BlatPick[]; rewards: BlatReward[]; codes: BlatCode[]; history: BlatEntry[] };

export async function balanceOf(recommenderId: string): Promise<number> {
  const [{ n }] = await db()<{ n: number }[]>`select coalesce(sum(delta), 0)::int as n from blat_points where recommender_id = ${recommenderId}`;
  return n;
}

/** Everything the recommender's own page shows. */
export async function loadDashboard(recommenderId: string): Promise<Dashboard> {
  const sql = db();
  const [balance, picks, rewards, codes, history] = await Promise.all([
    balanceOf(recommenderId),
    sql<BlatPick[]>`
      select p.id, p.code, p.note, v.name as venue_name, v.slug as venue_slug, v.category,
             (select count(distinct po.visitor_hash)::int from pick_opens po where po.pick_id = p.id and not po.is_bot) as opens,
             (select count(*)::int from guest_bookings b where b.pick_id = p.id and b.status <> 'cancelled') as bookings,
             (select coalesce(sum(gv.guests_count), 0)::int from guest_visits gv join guest_bookings b on b.id = gv.booking_id where b.pick_id = p.id) as guests,
             (select coalesce(sum(bp.delta), 0)::int from blat_points bp join guest_bookings b on b.id = bp.booking_id where b.pick_id = p.id) as points
      from picks p join venues v on v.id = p.venue_id
      where p.recommender_id = ${recommenderId} and p.active
      order by p.created_at desc`,
    rewardsList(),
    sql<BlatCode[]>`
      select r.id, r.code, r.status, w.title, w.title_kk, v.name as venue_name, r.created_at::text
      from blat_redemptions r join blat_rewards w on w.id = r.reward_id join venues v on v.id = r.venue_id
      where r.recommender_id = ${recommenderId} and r.status <> 'cancelled'
      order by r.status = 'issued' desc, r.created_at desc limit 20`,
    sql<BlatEntry[]>`
      select bp.delta, bp.reason, coalesce(vb.name, vr.name) as venue_name, bp.created_at::text
      from blat_points bp
      left join guest_bookings b on b.id = bp.booking_id left join venues vb on vb.id = b.venue_id
      left join blat_redemptions r on r.id = bp.redemption_id left join venues vr on vr.id = r.venue_id
      where bp.recommender_id = ${recommenderId}
      order by bp.created_at desc limit 20`,
  ]);
  return { balance, picks, rewards, codes, history };
}

/** Treats on offer at listed, active venues, cheapest first. */
export async function rewardsList(): Promise<BlatReward[]> {
  return db()<BlatReward[]>`
    select w.id, w.title, w.title_kk, w.cost, v.id as venue_id, v.name as venue_name, v.slug as venue_slug
    from blat_rewards w join venues v on v.id = w.venue_id
    where w.active and v.status = 'active' and v.is_listed
    order by w.cost, v.name`;
}

/** A venue's own treats, for its «Посоветовать другу» block. */
export async function venueRewards(venueId: string): Promise<{ title: string; title_kk: string | null; cost: number }[]> {
  return db()<{ title: string; title_kk: string | null; cost: number }[]>`
    select title, title_kk, cost from blat_rewards where venue_id = ${venueId} and active order by cost`;
}
