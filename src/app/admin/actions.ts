"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { bool, int, isUuid, str, strOrNull } from "@/lib/forms";
import { instagramHandle, isIsoDate, normalizePhone } from "@/lib/format";
import { isValidSlug, slugify } from "@/lib/slug";
import { fileFrom, removeImage, uploadImage, UploadError } from "@/lib/storage";
import { CATEGORIES, type Category, type FormState, type Status } from "@/lib/types";

// Every action starts with requireAdmin(): server actions are reachable by a
// POST to any path, so the /admin proxy alone does not protect them.

const STATUSES: Status[] = ["active", "paused", "archived"];

function newHostToken(): string {
  return randomBytes(24).toString("base64url"); // 32 chars
}

function pgCode(e: unknown): string | undefined {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : undefined;
}

function dbError(e: unknown): FormState {
  const code = pgCode(e);
  if (code === "23505") return { error: "Такая запись уже есть: адрес (slug) или пара заняты." };
  if (code === "23503") return { error: "Нельзя удалить: есть связанные данные. Поставьте на паузу или в архив." };
  if (code === "23514") return { error: "Значение не прошло проверку базы: проверьте возраст, числа и slug." };
  console.error(e);
  return { error: "Не удалось сохранить. Попробуйте ещё раз." };
}

/** Free slug based on `base`: base, base-2, base-3… */
async function freeSlug(table: "members" | "venues", base: string, exceptId?: string): Promise<string> {
  const root = (isValidSlug(base) ? base : `${base || "item"}-1`).slice(0, 36);
  const sql = db();
  for (let i = 1; i < 200; i++) {
    const s = i === 1 ? root : `${root}-${i}`;
    if (!isValidSlug(s)) continue;
    const rows =
      table === "members"
        ? await sql`select 1 from members where slug = ${s} and id is distinct from ${exceptId ?? null}`
        : await sql`select 1 from venues where slug = ${s} and id is distinct from ${exceptId ?? null}`;
    if (!rows.length) return s;
  }
  return `${root}-${randomBytes(3).toString("hex")}`;
}

function intField(fd: FormData, name: string, label: string, opts: { min?: number; max?: number } = {}): number | null | FormState {
  const n = int(fd, name);
  if (n === null) return null;
  if (Number.isNaN(n) || (opts.min !== undefined && n < opts.min) || (opts.max !== undefined && n > opts.max)) {
    return { error: `${label}: нужно число${opts.min !== undefined ? ` от ${opts.min}` : ""}${opts.max !== undefined ? ` до ${opts.max}` : ""}.` };
  }
  return n;
}
const isErr = (x: unknown): x is FormState => typeof x === "object" && x !== null;

// ── Applications ─────────────────────────────────────────────────────────

export async function reviewApplication(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const decision = str(fd, "decision", 10);
  const note = strOrNull(fd, "note", 500);
  if (!isUuid(id) || !["approve", "reject", "reopen"].includes(decision)) return;
  const sql = db();
  const [app] = await sql`select * from applications where id = ${id}`;
  if (!app) return;

  if (decision === "reject" || decision === "reopen") {
    const status = decision === "reject" ? "rejected" : "new";
    await sql`update applications set status = ${status}, review_note = coalesce(${note}, review_note), reviewed_at = now() where id = ${id}`;
    revalidatePath("/admin/applications");
    return;
  }

  // Approve: create the member or the venue once, linked to the application.
  if (app.kind === "member") {
    const [exists] = await sql`select id from members where application_id = ${id}`;
    if (!exists) {
      const slug = await freeSlug("members", slugify(app.instagram || "") || slugify(app.name || ""));
      await sql`
        insert into members (slug, name, age, city, instagram, interests, application_id)
        values (${slug}, ${app.name}, ${app.age}, ${app.city || "Алматы"}, ${app.instagram}, ${app.interests}, ${id})`;
    }
  } else {
    const [exists] = await sql`select id from venues where application_id = ${id}`;
    if (!exists) {
      const slug = await freeSlug("venues", slugify(app.venue_name || ""));
      await sql`
        insert into venues (slug, name, category, instagram, contact_name, phone, avg_check, host_token, application_id)
        values (${slug}, ${app.venue_name}, ${app.category}, ${app.instagram}, ${app.contact_name}, ${app.phone},
                ${app.avg_check}, ${newHostToken()}, ${id})`;
    }
  }
  await sql`update applications set status = 'approved', review_note = coalesce(${note}, review_note), reviewed_at = now() where id = ${id}`;
  revalidatePath("/admin/applications");
  revalidatePath("/admin/members");
  revalidatePath("/admin/venues");
}

// ── Members ──────────────────────────────────────────────────────────────

function readMember(fd: FormData) {
  const name = str(fd, "name", 80);
  const age = intField(fd, "age", "Возраст", { min: 18, max: 99 });
  const followers = intField(fd, "followers", "Подписчики", { min: 0 });
  const status = str(fd, "status", 20) as Status;
  if (!name) return { bad: { error: "Укажите имя." } };
  if (isErr(age)) return { bad: age };
  if (age === null) return { bad: { error: "Укажите возраст: только 18+." } };
  if (isErr(followers)) return { bad: followers };
  return {
    name,
    age,
    followers,
    slugInput: slugify(str(fd, "slug", 60)),
    city: str(fd, "city", 80) || "Алматы",
    instagram: instagramHandle(str(fd, "instagram", 120)),
    interests: strOrNull(fd, "interests", 600),
    phone: str(fd, "phone", 40) ? normalizePhone(str(fd, "phone", 40)) || str(fd, "phone", 40) : null,
    status: STATUSES.includes(status) ? status : "active",
    notes: strOrNull(fd, "notes", 2000),
  };
}

export async function createMember(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const m = readMember(fd);
  if ("bad" in m) return m.bad as FormState;
  let id: string;
  try {
    const slug = await freeSlug("members", m.slugInput || slugify(m.instagram || "") || slugify(m.name));
    [{ id }] = await db()<{ id: string }[]>`
      insert into members (slug, name, age, city, instagram, followers, interests, phone, status, notes)
      values (${slug}, ${m.name}, ${m.age}, ${m.city}, ${m.instagram}, ${m.followers}, ${m.interests}, ${m.phone}, ${m.status}, ${m.notes})
      returning id`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/members");
  redirect(`/admin/members/${id}`);
}

export async function updateMember(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return { error: "Нет id." };
  const m = readMember(fd);
  if ("bad" in m) return m.bad as FormState;
  if (!m.slugInput || !isValidSlug(m.slugInput)) return { error: "Slug: латиница, цифры и дефис, от 2 символов; нельзя admin, h, api, privacy." };
  try {
    await db()`
      update members set slug = ${m.slugInput}, name = ${m.name}, age = ${m.age}, city = ${m.city}, instagram = ${m.instagram},
        followers = ${m.followers}, interests = ${m.interests}, phone = ${m.phone}, status = ${m.status}, notes = ${m.notes}
      where id = ${id}`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteMember(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  try {
    await db()`delete from members where id = ${id}`;
  } catch (e) {
    // Has links: archive instead of losing pilot data.
    if (pgCode(e) === "23503") {
      await db()`update members set status = 'archived' where id = ${id}`;
      revalidatePath(`/admin/members/${id}`);
      return;
    }
    throw e;
  }
  revalidatePath("/admin/members");
  redirect("/admin/members");
}

// ── Venues ───────────────────────────────────────────────────────────────

function readVenue(fd: FormData) {
  const name = str(fd, "name", 120);
  const category = str(fd, "category", 20) as Category;
  const avg = intField(fd, "avg_check", "Средний чек", { min: 0 });
  const hold = intField(fd, "hold_minutes", "Стол занят на", { min: 30, max: 480 });
  const slot = Number(str(fd, "slot_minutes", 4));
  const openTime = str(fd, "open_time", 5) || "12:00";
  const closeTime = str(fd, "close_time", 5) || "23:00";
  const status = str(fd, "status", 20) as Status;
  if (!name) return { bad: { error: "Укажите название." } };
  if (isErr(avg)) return { bad: avg };
  if (isErr(hold)) return { bad: hold };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(openTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(closeTime)) return { bad: { error: "Часы работы: формат ЧЧ:ММ." } };
  return {
    name,
    slugInput: slugify(str(fd, "slug", 60)),
    category: CATEGORIES.includes(category) ? category : "restaurant",
    description: strOrNull(fd, "description", 1500),
    description_kk: strOrNull(fd, "description_kk", 1500),
    address: strOrNull(fd, "address", 200),
    city: str(fd, "city", 80) || "Алматы",
    instagram: instagramHandle(str(fd, "instagram", 120)),
    contact_name: strOrNull(fd, "contact_name", 120),
    phone: str(fd, "phone", 40) ? normalizePhone(str(fd, "phone", 40)) || str(fd, "phone", 40) : null,
    avg_check: avg,
    status: STATUSES.includes(status) ? status : "active",
    notes: strOrNull(fd, "notes", 2000),
    is_listed: bool(fd, "is_listed"),
    featured: bool(fd, "featured"),
    open_time: openTime,
    close_time: closeTime,
    slot_minutes: [15, 30, 60].includes(slot) ? slot : 30,
    hold_minutes: hold ?? 120,
  };
}

export async function createVenue(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const v = readVenue(fd);
  if ("bad" in v) return v.bad as FormState;
  let id: string;
  try {
    const slug = await freeSlug("venues", v.slugInput || slugify(v.name));
    [{ id }] = await db()<{ id: string }[]>`
      insert into venues (slug, name, category, description, description_kk, address, city, instagram, contact_name, phone, avg_check, status, notes, host_token,
                          is_listed, featured, open_time, close_time, slot_minutes, hold_minutes)
      values (${slug}, ${v.name}, ${v.category}, ${v.description}, ${v.description_kk}, ${v.address}, ${v.city}, ${v.instagram},
              ${v.contact_name}, ${v.phone}, ${v.avg_check}, ${v.status}, ${v.notes}, ${newHostToken()},
              ${v.is_listed}, ${v.featured}, ${v.open_time}, ${v.close_time}, ${v.slot_minutes}, ${v.hold_minutes})
      returning id`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin/venues");
  redirect(`/admin/venues/${id}`);
}

export async function updateVenue(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return { error: "Нет id." };
  const v = readVenue(fd);
  if ("bad" in v) return v.bad as FormState;
  if (!v.slugInput || !isValidSlug(v.slugInput)) return { error: "Slug: латиница, цифры и дефис, от 2 символов." };
  try {
    await db()`
      update venues set slug = ${v.slugInput}, name = ${v.name}, category = ${v.category}, description = ${v.description},
        description_kk = ${v.description_kk}, address = ${v.address}, city = ${v.city}, instagram = ${v.instagram},
        contact_name = ${v.contact_name}, phone = ${v.phone}, avg_check = ${v.avg_check}, status = ${v.status}, notes = ${v.notes},
        is_listed = ${v.is_listed}, featured = ${v.featured}, open_time = ${v.open_time}, close_time = ${v.close_time},
        slot_minutes = ${v.slot_minutes}, hold_minutes = ${v.hold_minutes}
      where id = ${id}`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteVenue(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  const sql = db();
  try {
    const [v] = await sql<{ photo_path: string | null }[]>`delete from venues where id = ${id} returning photo_path`;
    await removeImage("venue-photos", v?.photo_path ?? null);
  } catch (e) {
    if (pgCode(e) === "23503") {
      await sql`update venues set status = 'archived' where id = ${id}`;
      revalidatePath(`/admin/venues/${id}`);
      return;
    }
    throw e;
  }
  revalidatePath("/admin/venues");
  redirect("/admin/venues");
}

export async function uploadVenuePhoto(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const file = fileFrom(fd, "photo");
  if (!isUuid(id)) return { error: "Нет id." };
  if (!file) return { error: "Выберите фото." };
  try {
    const key = await uploadImage("venue-photos", id, file);
    const [old] = await db()<{ photo_path: string | null }[]>`
      update venues v set photo_path = ${key} from (select photo_path from venues where id = ${id}) o
      where v.id = ${id} returning o.photo_path`;
    await removeImage("venue-photos", old?.photo_path ?? null);
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    return dbError(e);
  }
  revalidatePath(`/admin/venues/${id}`);
  return { ok: true, message: "Фото обновлено" };
}

export async function removeVenuePhoto(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  const [old] = await db()<{ photo_path: string | null }[]>`
    update venues v set photo_path = null from (select photo_path from venues where id = ${id}) o
    where v.id = ${id} returning o.photo_path`;
  await removeImage("venue-photos", old?.photo_path ?? null);
  revalidatePath(`/admin/venues/${id}`);
}

export async function uploadVenueLogo(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const file = fileFrom(fd, "logo");
  if (!isUuid(id)) return { error: "Нет id." };
  if (!file) return { error: "Выберите логотип." };
  try {
    const key = await uploadImage("venue-photos", `${id}/logo`, file);
    const [old] = await db()<{ logo_path: string | null }[]>`
      update venues v set logo_path = ${key} from (select logo_path from venues where id = ${id}) o
      where v.id = ${id} returning o.logo_path`;
    await removeImage("venue-photos", old?.logo_path ?? null);
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    return dbError(e);
  }
  revalidatePath(`/admin/venues/${id}`);
  return { ok: true, message: "Логотип обновлён" };
}

export async function removeVenueLogo(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  const [old] = await db()<{ logo_path: string | null }[]>`
    update venues v set logo_path = null from (select logo_path from venues where id = ${id}) o
    where v.id = ${id} returning o.logo_path`;
  await removeImage("venue-photos", old?.logo_path ?? null);
  revalidatePath(`/admin/venues/${id}`);
}

/** New hostess link; the old one stops working immediately. */
export async function regenerateHostToken(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  await db()`update venues set host_token = ${newHostToken()} where id = ${id}`;
  revalidatePath(`/admin/venues/${id}`);
}

// ── Offers (what the member gets) and perks (what her followers get) ─────

function readOffer(fd: FormData) {
  const title = str(fd, "title", 120);
  const reward = str(fd, "member_reward", 300);
  const value = intField(fd, "member_reward_value", "Номинал", { min: 0 });
  if (!title) return { bad: { error: "Укажите название offer." } };
  if (!reward) return { bad: { error: "Укажите, что получает участница." } };
  if (isErr(value)) return { bad: value };
  return {
    title,
    member_reward: reward,
    member_reward_value: value,
    guest_perk: strOrNull(fd, "guest_perk", 300),
    guest_perk_kk: strOrNull(fd, "guest_perk_kk", 300),
    terms: strOrNull(fd, "terms", 500),
    active: bool(fd, "active"),
  };
}

export async function createOffer(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const venueId = str(fd, "venue_id", 40);
  if (!isUuid(venueId)) return { error: "Нет заведения." };
  const o = readOffer(fd);
  if ("bad" in o) return o.bad as FormState;
  try {
    await db()`
      insert into offers (venue_id, title, member_reward, member_reward_value, guest_perk, guest_perk_kk, terms, active)
      values (${venueId}, ${o.title}, ${o.member_reward}, ${o.member_reward_value}, ${o.guest_perk}, ${o.guest_perk_kk}, ${o.terms}, ${o.active})`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath(`/admin/venues/${venueId}`);
  return { ok: true, message: "Offer добавлен" };
}

export async function updateOffer(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return { error: "Нет id." };
  const o = readOffer(fd);
  if ("bad" in o) return o.bad as FormState;
  try {
    await db()`
      update offers set title = ${o.title}, member_reward = ${o.member_reward}, member_reward_value = ${o.member_reward_value},
        guest_perk = ${o.guest_perk}, guest_perk_kk = ${o.guest_perk_kk}, terms = ${o.terms}, active = ${o.active}
      where id = ${id}`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteOffer(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  await db()`delete from offers where id = ${id}`; // links keep working without an offer
  revalidatePath("/admin", "layout");
}

// ── Tracking links: member × venue ───────────────────────────────────────

export async function createLink(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const memberId = str(fd, "member_id", 40);
  const venueId = str(fd, "venue_id", 40);
  const offerId = str(fd, "offer_id", 40) || null;
  if (!isUuid(memberId) || !isUuid(venueId)) return { error: "Выберите участницу и заведение." };
  if (offerId && !isUuid(offerId)) return { error: "Неверный offer." };
  let id: string;
  try {
    [{ id }] = await db()<{ id: string }[]>`
      insert into tracking_links (member_id, venue_id, offer_id, code_phrase)
      values (${memberId}, ${venueId}, ${offerId}, ${strOrNull(fd, "code_phrase", 120)})
      returning id`;
  } catch (e) {
    if (pgCode(e) === "23505") return { error: "Такая пара уже есть: откройте её в списке ниже." };
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/links/${id}`);
}

export async function updateLink(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const offerId = str(fd, "offer_id", 40) || null;
  if (!isUuid(id)) return { error: "Нет id." };
  if (offerId && !isUuid(offerId)) return { error: "Неверный offer." };
  try {
    await db()`
      update tracking_links set offer_id = ${offerId}, code_phrase = ${strOrNull(fd, "code_phrase", 120)}, active = ${bool(fd, "active")}
      where id = ${id}`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function toggleLink(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  await db()`update tracking_links set active = not active where id = ${id}`;
  revalidatePath("/admin", "layout");
}

export async function deleteLink(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  try {
    await db()`delete from tracking_links where id = ${id}`;
  } catch (e) {
    if (pgCode(e) === "23503") {
      await db()`update tracking_links set active = false where id = ${id}`;
      revalidatePath(`/admin/links/${id}`);
      return;
    }
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect("/admin/links");
}

// ── Member visits and story proofs ───────────────────────────────────────

export async function addMemberVisit(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const linkId = str(fd, "link_id", 40);
  const date = str(fd, "visit_date", 10);
  const value = intField(fd, "reward_value", "Номинал", { min: 0 });
  if (!isUuid(linkId)) return { error: "Нет пары." };
  if (!isIsoDate(date)) return { error: "Укажите дату визита." };
  if (isErr(value)) return value;
  try {
    await db()`
      insert into member_visits (tracking_link_id, visit_date, received, reward_value, source, notes)
      select ${linkId}, ${date}, coalesce(${strOrNull(fd, "received", 300)}, o.member_reward),
             coalesce(${value}, o.member_reward_value), 'admin', ${strOrNull(fd, "notes", 500)}
      from tracking_links tl left join offers o on o.id = tl.offer_id where tl.id = ${linkId}`;
  } catch (e) {
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Визит добавлен" };
}

export async function deleteMemberVisit(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  const sql = db();
  const proofs = await sql<{ screenshot_path: string | null }[]>`select screenshot_path from content_proofs where member_visit_id = ${id}`;
  await sql`delete from member_visits where id = ${id}`;
  for (const p of proofs) await removeImage("story-proofs", p.screenshot_path);
  revalidatePath("/admin", "layout");
}

export async function addProof(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const visitId = str(fd, "member_visit_id", 40);
  const kind = str(fd, "kind", 10) || "story";
  const views = intField(fd, "views", "Просмотры", { min: 0 });
  const postedAt = str(fd, "posted_at", 10);
  const file = fileFrom(fd, "screenshot");
  if (!isUuid(visitId)) return { error: "Нет визита." };
  if (!["story", "post", "reel"].includes(kind)) return { error: "Неверный тип." };
  if (isErr(views)) return views;
  if (!file && views === null) return { error: "Загрузите скрин или укажите просмотры." };
  if (postedAt && !isIsoDate(postedAt)) return { error: "Неверная дата публикации." };
  try {
    const key = file ? await uploadImage("story-proofs", visitId, file) : null;
    await db()`
      insert into content_proofs (member_visit_id, kind, screenshot_path, views, posted_at)
      values (${visitId}, ${kind}, ${key}, ${views}, ${postedAt || null})`;
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Добавлено" };
}

export async function updateProof(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const views = intField(fd, "views", "Просмотры", { min: 0 });
  const file = fileFrom(fd, "screenshot");
  if (!isUuid(id)) return { error: "Нет id." };
  if (isErr(views)) return views;
  try {
    const sql = db();
    if (file) {
      const [p] = await sql<{ member_visit_id: string; screenshot_path: string | null }[]>`
        select member_visit_id, screenshot_path from content_proofs where id = ${id}`;
      if (!p) return { error: "Не найдено." };
      const key = await uploadImage("story-proofs", p.member_visit_id, file);
      await sql`update content_proofs set screenshot_path = ${key} where id = ${id}`;
      await removeImage("story-proofs", p.screenshot_path);
    }
    await sql`update content_proofs set views = ${views} where id = ${id}`;
  } catch (e) {
    if (e instanceof UploadError) return { error: e.message };
    return dbError(e);
  }
  revalidatePath("/admin", "layout");
  return { ok: true };
}

export async function deleteProof(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  const [p] = await db()<{ screenshot_path: string | null }[]>`delete from content_proofs where id = ${id} returning screenshot_path`;
  await removeImage("story-proofs", p?.screenshot_path ?? null);
  revalidatePath("/admin", "layout");
}

// ── Bookings (admin side) ────────────────────────────────────────────────

export async function setBookingStatus(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  const status = str(fd, "status", 20);
  if (!isUuid(id) || !["new", "cancelled", "no_show"].includes(status)) return;
  const sql = db();
  await sql.begin(async (tx) => {
    await tx`delete from guest_visits where booking_id = ${id}`;
    await tx`update guest_bookings set status = ${status} where id = ${id}`;
  });
  revalidatePath("/admin", "layout");
}

export async function deleteGuestVisit(fd: FormData): Promise<void> {
  await requireAdmin();
  const id = str(fd, "id", 40);
  if (!isUuid(id)) return;
  await db().begin(async (tx) => {
    const [gv] = await tx<{ booking_id: string | null }[]>`delete from guest_visits where id = ${id} returning booking_id`;
    if (gv?.booking_id) await tx`update guest_bookings set status = 'new' where id = ${gv.booking_id}`;
  });
  revalidatePath("/admin", "layout");
}

// ── Floor plan ───────────────────────────────────────────────────────────

type PlanPayload = {
  halls: { id: string; name: string; name_kk: string | null; width: number; height: number }[];
  items: { id: string; hall_id: string; kind: string; label: string; shape: string; x: number; y: number; w: number; h: number; seats_min: number; seats_max: number }[];
};

const num = (x: unknown, lo: number, hi: number) => {
  const n = Number(x);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n * 100) / 100)) : lo;
};

/** Replaces a venue's halls and tables with what the editor sends. */
export async function savePlan(_prev: FormState, fd: FormData): Promise<FormState> {
  await requireAdmin();
  const venueId = str(fd, "venue_id", 40);
  if (!isUuid(venueId)) return { error: "Нет заведения." };
  let plan: PlanPayload;
  try {
    plan = JSON.parse(String(fd.get("plan") || "{}"));
  } catch {
    return { error: "План не прочитался. Обновите страницу." };
  }
  const halls = Array.isArray(plan.halls) ? plan.halls.slice(0, 10) : [];
  const hallIds = new Set(halls.map((h) => h.id));
  if (!halls.length) return { error: "Нужен хотя бы один зал." };
  if (halls.some((h) => !isUuid(h.id) || !String(h.name || "").trim())) return { error: "У каждого зала должно быть название." };
  const items = (Array.isArray(plan.items) ? plan.items.slice(0, 300) : []).filter((i) => isUuid(i.id) && hallIds.has(i.hall_id));

  try {
    await db().begin(async (tx) => {
      const keepItems = items.map((i) => i.id);
      const keepHalls = halls.map((h) => h.id);
      await tx`delete from venue_tables where venue_id = ${venueId} and not (id = any(${keepItems}::uuid[]))`;
      await tx`delete from venue_halls where venue_id = ${venueId} and not (id = any(${keepHalls}::uuid[]))`;
      for (const [i, h] of halls.entries()) {
        const width = num(h.width, 20, 400), height = num(h.height, 20, 400);
        await tx`
          insert into venue_halls (id, venue_id, name, name_kk, width, height, sort)
          values (${h.id}, ${venueId}, ${String(h.name).trim().slice(0, 60)}, ${String(h.name_kk || "").trim().slice(0, 60) || null},
                  ${Math.round(width)}, ${Math.round(height)}, ${i})
          on conflict (id) do update set name = excluded.name, name_kk = excluded.name_kk, width = excluded.width,
            height = excluded.height, sort = excluded.sort
          where venue_halls.venue_id = ${venueId}`;
      }
      for (const it of items) {
        const hall = halls.find((h) => h.id === it.hall_id)!;
        const kind = it.kind === "decor" ? "decor" : "table";
        const shape = it.shape === "round" ? "round" : "rect";
        const w = num(it.w, 2, hall.width), h = num(it.h, 2, hall.height);
        const x = num(it.x, 0, hall.width - w), y = num(it.y, 0, hall.height - h);
        const smin = Math.round(num(it.seats_min, 1, 50)), smax = Math.max(smin, Math.round(num(it.seats_max, 1, 50)));
        await tx`
          insert into venue_tables (id, venue_id, hall_id, kind, label, shape, x, y, w, h, seats_min, seats_max)
          values (${it.id}, ${venueId}, ${it.hall_id}, ${kind}, ${String(it.label || "").trim().slice(0, 24)}, ${shape},
                  ${x}, ${y}, ${w}, ${h}, ${smin}, ${smax})
          on conflict (id) do update set hall_id = excluded.hall_id, kind = excluded.kind, label = excluded.label,
            shape = excluded.shape, x = excluded.x, y = excluded.y, w = excluded.w, h = excluded.h,
            seats_min = excluded.seats_min, seats_max = excluded.seats_max, active = true
          where venue_tables.venue_id = ${venueId}`;
      }
    });
  } catch (e) {
    return dbError(e);
  }
  revalidatePath(`/admin/venues/${venueId}`);
  return { ok: true, message: "План сохранён" };
}
