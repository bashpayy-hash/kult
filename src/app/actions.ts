"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { dicts } from "@/lib/i18n/dicts";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/i18n";
import { bool, int, isUuid, str, strOrNull, values } from "@/lib/forms";
import { almatyToday, earliestStart, isIsoDate, normalizePhone, instagramHandle, shiftDate } from "@/lib/format";
import { fits, isFree, LEAD_MINUTES, pickTable, slotList, toCalendar, type PlanItem } from "@/lib/booking";
import { loadPlan, loadTaken } from "@/lib/venueData";
import { getVisitor } from "@/lib/visitor";
import { CATEGORIES, type Category, type FormState } from "@/lib/types";

function langOf(fd: FormData): Lang {
  const l = fd.get("lang");
  return isLang(l) ? l : "ru";
}

export async function setLang(fd: FormData): Promise<void> {
  const l = fd.get("lang");
  if (!isLang(l)) return;
  (await cookies()).set(LANG_COOKIE, l, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

// ── Applications from the landing ────────────────────────────────────────

const MEMBER_FIELDS = ["name", "age", "city", "instagram", "interests", "consent"];

export async function submitMemberApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const t = dicts[lang];
  if (str(fd, "website")) return { ok: true }; // honeypot: pretend it worked

  const name = str(fd, "name", 80);
  const age = int(fd, "age");
  const city = str(fd, "city", 80);
  const instagram = instagramHandle(str(fd, "instagram", 120));
  const interests = strOrNull(fd, "interests", 600);
  const consent = bool(fd, "consent");

  const fe: Record<string, string> = {};
  if (!name) fe.name = t.errors.required;
  if (age === null) fe.age = t.errors.required;
  else if (Number.isNaN(age) || age > 99) fe.age = t.errors.ageInvalid;
  else if (age < 18) fe.age = t.errors.age18;
  if (!city) fe.city = t.errors.required;
  if (!instagram) fe.instagram = t.errors.required;
  if (!consent) fe.consent = t.errors.consent;
  if (Object.keys(fe).length) return { fieldErrors: fe, error: t.errors.form, values: values(fd, MEMBER_FIELDS) };

  try {
    await db()`
      insert into applications (kind, name, age, city, instagram, interests, consent, lang)
      values ('member', ${name}, ${age}, ${city}, ${instagram}, ${interests}, true, ${lang})`;
  } catch (e) {
    console.error("member application failed", e);
    return { error: t.errors.generic, values: values(fd, MEMBER_FIELDS) };
  }
  return { ok: true };
}

const PARTNER_FIELDS = ["venue_name", "category", "contact_name", "phone", "instagram", "avg_check", "consent"];

export async function submitPartnerApplication(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const t = dicts[lang];
  if (str(fd, "website")) return { ok: true };

  const venueName = str(fd, "venue_name", 120);
  const category = str(fd, "category", 20) as Category;
  const contactName = str(fd, "contact_name", 120);
  const phoneRaw = str(fd, "phone", 40);
  const phone = normalizePhone(phoneRaw);
  const instagram = instagramHandle(str(fd, "instagram", 120));
  const avgCheck = int(fd, "avg_check");
  const consent = bool(fd, "consent");

  const fe: Record<string, string> = {};
  if (!venueName) fe.venue_name = t.errors.required;
  if (!CATEGORIES.includes(category)) fe.category = t.errors.required;
  if (!contactName) fe.contact_name = t.errors.required;
  if (!phoneRaw) fe.phone = t.errors.required;
  else if (!phone) fe.phone = t.errors.phone;
  if (avgCheck !== null && (Number.isNaN(avgCheck) || avgCheck < 0)) fe.avg_check = t.errors.number;
  if (!consent) fe.consent = t.errors.consent;
  if (Object.keys(fe).length) return { fieldErrors: fe, error: t.errors.form, values: values(fd, PARTNER_FIELDS) };

  try {
    await db()`
      insert into applications (kind, venue_name, category, contact_name, phone, instagram, avg_check, consent, lang)
      values ('partner', ${venueName}, ${category}, ${contactName}, ${phone}, ${instagram}, ${avgCheck}, true, ${lang})`;
  } catch (e) {
    console.error("partner application failed", e);
    return { error: t.errors.generic, values: values(fd, PARTNER_FIELDS) };
  }
  return { ok: true };
}

// ── Booking: from the catalog (/v/<venue>) or a member link (/<member>/<venue>) ──

const BOOKING_FIELDS = ["guest_name", "phone", "comment", "consent"];
const MAX_BOOKINGS_PER_HOUR = 5;

type VenueRow = { id: string; open_time: string; close_time: string; slot_minutes: number; hold_minutes: number };

/**
 * The browser already greys out busy slots and tables; everything is checked
 * again here, and the database's exclusion constraint is the last word when
 * two guests take the same table at the same moment.
 */
export async function submitBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const t = dicts[lang];
  if (str(fd, "website")) return { ok: true };

  const venueId = str(fd, "venue_id", 40);
  const linkId = str(fd, "link_id", 40) || null;
  if (!isUuid(venueId) || (linkId && !isUuid(linkId))) return { error: t.errors.generic };

  const guestName = str(fd, "guest_name", 80);
  const phoneRaw = str(fd, "phone", 40);
  const phone = normalizePhone(phoneRaw);
  const date = str(fd, "date", 10);
  const slot = int(fd, "slot");
  const party = int(fd, "party_size");
  const tableId = str(fd, "table_id", 40) || null;
  const comment = strOrNull(fd, "comment", 500);
  const consent = bool(fd, "consent");

  const today = almatyToday();
  const fe: Record<string, string> = {};
  if (!guestName) fe.guest_name = t.errors.required;
  if (!phoneRaw) fe.phone = t.errors.required;
  else if (!phone) fe.phone = t.errors.phone;
  if (!consent) fe.consent = t.errors.consent;
  if (Object.keys(fe).length) return { fieldErrors: fe, error: t.errors.form, values: values(fd, BOOKING_FIELDS) };
  const keep = values(fd, BOOKING_FIELDS);

  if (!isIsoDate(date) || date < today || date > shiftDate(today, 90)) return { error: t.errors.date, values: keep };
  if (party === null || Number.isNaN(party) || party < 1 || party > 30) return { error: t.errors.party, values: keep };
  if (slot === null || Number.isNaN(slot)) return { error: t.errors.slot, values: keep };
  if (tableId && !isUuid(tableId)) return { error: t.errors.generic, values: keep };

  const sql = db();
  const visitor = await getVisitor();
  try {
    const [venue] = await sql<VenueRow[]>`
      select id, open_time::text, close_time::text, slot_minutes, hold_minutes
      from venues where id = ${venueId} and status = 'active'`;
    if (!venue) return { error: t.invite.inactiveTitle };

    if (linkId) {
      const [link] = await sql`
        select 1 from tracking_links tl join members m on m.id = tl.member_id
        where tl.id = ${linkId} and tl.venue_id = ${venueId} and tl.active and m.status = 'active'`;
      if (!link) return { error: t.invite.inactiveTitle };
    }

    if (!slotList(venue).includes(slot) || slot < earliestStart(date, LEAD_MINUTES)) {
      return { error: t.errors.slot, values: keep };
    }

    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from guest_bookings
      where venue_id = ${venueId} and visitor_hash = ${visitor.hash} and created_at > now() - interval '1 hour'`;
    if (n >= MAX_BOOKINGS_PER_HOUR) return { error: t.errors.tooMany, values: keep };

    // Venues with a floor plan seat every booking at a table.
    const tables = (await loadPlan(venueId)).items.filter((i) => i.kind === "table");
    let table: PlanItem | null = null;
    if (tables.length) {
      const taken = await loadTaken(venueId, date);
      if (tableId) {
        table = tables.find((x) => x.id === tableId) ?? null;
        if (!table) return { error: t.errors.generic, values: keep };
        if (!fits(table, party)) return { error: t.errors.tableSize(party), values: keep };
        if (!isFree(table.id, slot, venue.hold_minutes, taken)) return { error: t.errors.tableBusy, values: keep };
      } else {
        table = pickTable(tables, party, slot, venue.hold_minutes, taken);
        if (!table) return { error: t.errors.noTables(party), values: keep };
      }
    }

    const at = toCalendar(date, slot);
    await sql`
      insert into guest_bookings
        (venue_id, tracking_link_id, source, table_id, hold_minutes, guest_name, phone,
         booking_date, booking_time, party_size, comment, consent, visitor_hash, lang)
      values
        (${venueId}, ${linkId}, ${linkId ? "link" : "catalog"}, ${table?.id ?? null}, ${venue.hold_minutes}, ${guestName}, ${phone},
         ${at.date}, ${at.time}, ${party}, ${comment}, true, ${visitor.hash}, ${lang})`;
    // The calendar date, not the service day: a 00:30 table is «14 ноября, 00:30».
    return { ok: true, values: { date: at.date, time: at.time, table: table?.label ?? "", party_size: String(party) } };
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "23P01") {
      return { error: t.errors.tableBusy, values: keep };
    }
    console.error("booking failed", e);
    return { error: t.errors.generic, values: keep };
  }
}
