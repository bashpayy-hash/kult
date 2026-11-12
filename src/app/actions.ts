"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { dicts } from "@/lib/i18n/dicts";
import { isLang, LANG_COOKIE, type Lang } from "@/lib/i18n";
import { bool, int, isUuid, str, strOrNull, values } from "@/lib/forms";
import { almatyToday, isIsoDate, normalizePhone, instagramHandle, shiftDate } from "@/lib/format";
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

// ── Booking from /<member>/<venue> ───────────────────────────────────────

const BOOKING_FIELDS = ["guest_name", "phone", "booking_date", "booking_time", "party_size", "comment", "consent"];
const MAX_BOOKINGS_PER_HOUR = 5;

export async function submitBooking(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const t = dicts[lang];
  if (str(fd, "website")) return { ok: true };

  const linkId = str(fd, "link_id", 40);
  if (!isUuid(linkId)) return { error: t.errors.generic };

  const guestName = str(fd, "guest_name", 80);
  const phoneRaw = str(fd, "phone", 40);
  const phone = normalizePhone(phoneRaw);
  const date = str(fd, "booking_date", 10);
  const time = str(fd, "booking_time", 5);
  const party = int(fd, "party_size");
  const comment = strOrNull(fd, "comment", 500);
  const consent = bool(fd, "consent");

  const today = almatyToday();
  const fe: Record<string, string> = {};
  if (!guestName) fe.guest_name = t.errors.required;
  if (!phoneRaw) fe.phone = t.errors.required;
  else if (!phone) fe.phone = t.errors.phone;
  if (!isIsoDate(date) || date < today || date > shiftDate(today, 90)) fe.booking_date = t.errors.date;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) fe.booking_time = t.errors.time;
  if (party === null || Number.isNaN(party) || party < 1 || party > 30) fe.party_size = t.errors.party;
  if (!consent) fe.consent = t.errors.consent;
  if (Object.keys(fe).length) return { fieldErrors: fe, error: t.errors.form, values: values(fd, BOOKING_FIELDS) };

  const sql = db();
  const visitor = await getVisitor();
  try {
    const [link] = await sql<{ id: string }[]>`
      select tl.id from tracking_links tl
      join members m on m.id = tl.member_id
      join venues v on v.id = tl.venue_id
      where tl.id = ${linkId} and tl.active and m.status = 'active' and v.status = 'active'`;
    if (!link) return { error: t.invite.inactiveTitle };

    const [{ n }] = await sql<{ n: number }[]>`
      select count(*)::int as n from guest_bookings
      where tracking_link_id = ${linkId} and visitor_hash = ${visitor.hash}
        and created_at > now() - interval '1 hour'`;
    if (n >= MAX_BOOKINGS_PER_HOUR) return { error: t.errors.tooMany, values: values(fd, BOOKING_FIELDS) };

    await sql`
      insert into guest_bookings
        (tracking_link_id, guest_name, phone, booking_date, booking_time, party_size, comment, consent, visitor_hash, lang)
      values
        (${linkId}, ${guestName}, ${phone}, ${date}, ${time}, ${party}, ${comment}, true, ${visitor.hash}, ${lang})`;
  } catch (e) {
    console.error("booking failed", e);
    return { error: t.errors.generic, values: values(fd, BOOKING_FIELDS) };
  }
  return { ok: true, values: { booking_date: date, booking_time: time, party_size: String(party) } };
}
