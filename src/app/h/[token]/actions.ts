"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { dicts } from "@/lib/i18n/dicts";
import { isLang, type Lang } from "@/lib/i18n";
import { int, isUuid, str, strOrNull } from "@/lib/forms";
import { almatyToday, isIsoDate, shiftDate } from "@/lib/format";
import type { FormState } from "@/lib/types";

// Every action re-resolves the venue from the secret token and checks that
// the row it touches belongs to that venue. No login: the token is the key.

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

async function venueFor(fd: FormData): Promise<{ id: string; token: string } | null> {
  const token = str(fd, "token", 64);
  if (!TOKEN_RE.test(token)) return null;
  const [v] = await db()<{ id: string }[]>`select id from venues where host_token = ${token} and status <> 'archived'`;
  return v ? { id: v.id, token } : null;
}

function lang(fd: FormData): Lang {
  const l = fd.get("lang");
  return isLang(l) ? l : "ru";
}

/** Hostess may log a week back or ahead, not further. */
function dateOk(d: string): boolean {
  const today = almatyToday();
  return isIsoDate(d) && d >= shiftDate(today, -7) && d <= shiftDate(today, 7);
}

function guestsAndCheck(fd: FormData, t: (typeof dicts)["ru"]) {
  const guests = int(fd, "guests_count");
  const amount = int(fd, "check_amount");
  const fe: Record<string, string> = {};
  if (guests === null || Number.isNaN(guests) || guests < 1 || guests > 50) fe.guests_count = t.errors.number;
  if (amount === null || Number.isNaN(amount) || amount < 0) fe.check_amount = t.errors.number;
  return { guests: guests as number, amount: amount as number, fe };
}

export async function markArrived(_prev: FormState, fd: FormData): Promise<FormState> {
  const t = dicts[lang(fd)];
  const venue = await venueFor(fd);
  if (!venue) return { error: t.host.badTitle };
  const bookingId = str(fd, "booking_id", 40);
  if (!isUuid(bookingId)) return { error: t.errors.generic };
  const { guests, amount, fe } = guestsAndCheck(fd, t);
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const sql = db();
  const ok = await sql.begin(async (tx) => {
    const [b] = await tx<{ id: string; tracking_link_id: string | null; booking_date: string }[]>`
      select b.id, b.tracking_link_id, b.booking_date from guest_bookings b
      where b.id = ${bookingId} and b.venue_id = ${venue.id}
      for update`;
    if (!b) return false;
    await tx`update guest_bookings set status = 'arrived' where id = ${b.id}`;
    await tx`
      insert into guest_visits (tracking_link_id, venue_id, booking_id, source, visit_date, guests_count, check_amount)
      values (${b.tracking_link_id}, ${venue.id}, ${b.id}, 'booking', ${b.booking_date}, ${guests}, ${amount})
      on conflict (booking_id) do update
        set guests_count = excluded.guests_count, check_amount = excluded.check_amount`;
    return true;
  });
  if (!ok) return { error: t.errors.generic };
  revalidatePath(`/h/${venue.token}`);
  return { ok: true, message: t.host.saved };
}

export async function markNoShow(fd: FormData): Promise<void> {
  const venue = await venueFor(fd);
  const bookingId = str(fd, "booking_id", 40);
  if (!venue || !isUuid(bookingId)) return;
  const sql = db();
  await sql.begin(async (tx) => {
    const [b] = await tx<{ id: string }[]>`
      select b.id from guest_bookings b where b.id = ${bookingId} and b.venue_id = ${venue.id}`;
    if (!b) return;
    await tx`delete from guest_visits where booking_id = ${b.id}`;
    await tx`update guest_bookings set status = 'no_show' where id = ${b.id}`;
  });
  revalidatePath(`/h/${venue.token}`);
}

/** A guest without a booking said «я от {имя}». */
export async function addPhraseGuest(_prev: FormState, fd: FormData): Promise<FormState> {
  const t = dicts[lang(fd)];
  const venue = await venueFor(fd);
  if (!venue) return { error: t.host.badTitle };
  const linkId = str(fd, "link_id", 40);
  const date = str(fd, "date", 10);
  const fe: Record<string, string> = {};
  if (!isUuid(linkId)) fe.link_id = t.errors.required;
  const g = guestsAndCheck(fd, t);
  Object.assign(fe, g.fe);
  if (!dateOk(date)) return { error: t.errors.generic };
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const res = await db()`
    insert into guest_visits (tracking_link_id, venue_id, source, visit_date, guests_count, check_amount)
    select tl.id, tl.venue_id, 'phrase', ${date}, ${g.guests}, ${g.amount}
    from tracking_links tl where tl.id = ${linkId} and tl.venue_id = ${venue.id}`;
  if (!res.count) return { error: t.errors.generic };
  revalidatePath(`/h/${venue.token}`);
  return { ok: true, message: t.host.saved };
}

/** The member herself came and received the offer. */
export async function addMemberVisit(_prev: FormState, fd: FormData): Promise<FormState> {
  const t = dicts[lang(fd)];
  const venue = await venueFor(fd);
  if (!venue) return { error: t.host.badTitle };
  const linkId = str(fd, "link_id", 40);
  const date = str(fd, "visit_date", 10);
  const received = strOrNull(fd, "received", 300);
  const fe: Record<string, string> = {};
  if (!isUuid(linkId)) fe.link_id = t.errors.required;
  if (!dateOk(date)) fe.visit_date = t.errors.date;
  if (Object.keys(fe).length) return { fieldErrors: fe };

  const res = await db()`
    insert into member_visits (tracking_link_id, visit_date, received, reward_value, source)
    select tl.id, ${date}, coalesce(${received}, o.member_reward), o.member_reward_value, 'host'
    from tracking_links tl left join offers o on o.id = tl.offer_id
    where tl.id = ${linkId} and tl.venue_id = ${venue.id}`;
  if (!res.count) return { error: t.errors.generic };
  revalidatePath(`/h/${venue.token}`);
  return { ok: true, message: t.host.saved };
}

/** Undo a mistaken entry from today's log. */
export async function removeEntry(fd: FormData): Promise<void> {
  const venue = await venueFor(fd);
  const id = str(fd, "id", 40);
  const kind = str(fd, "kind", 10);
  if (!venue || !isUuid(id)) return;
  const sql = db();
  if (kind === "guest") {
    await sql`
      delete from guest_visits gv using tracking_links tl
      where gv.id = ${id} and gv.source = 'phrase' and tl.id = gv.tracking_link_id and tl.venue_id = ${venue.id}`;
  } else if (kind === "member") {
    // A visit that already has a story proof attached is kept: that is admin territory.
    await sql`
      delete from member_visits mv using tracking_links tl
      where mv.id = ${id} and mv.source = 'host' and tl.id = mv.tracking_link_id and tl.venue_id = ${venue.id}
        and not exists (select 1 from content_proofs cp where cp.member_visit_id = mv.id)`;
  }
  revalidatePath(`/h/${venue.token}`);
}
