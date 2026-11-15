"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { bool, isUuid, str, strOrNull } from "@/lib/forms";
import { normalizePhone } from "@/lib/format";
import { dicts } from "@/lib/i18n/dicts";
import { isLang, type Lang } from "@/lib/i18n";
import { currentRecommender, newPickCode, newRedeemCode, newSecret, recommenderBySecret, rememberRecommender, type Recommender } from "@/lib/blat";
import { siteUrl } from "@/lib/env";
import type { FormState } from "@/lib/types";

const MAX_PICKS = 30;

function langOf(fd: FormData): Lang {
  const l = fd.get("lang");
  return isLang(l) ? l : "ru";
}

/** The recommender acting: from the private link's secret if the form carries it, else this browser's cookie. */
async function actor(fd: FormData): Promise<Recommender | null> {
  const secret = str(fd, "secret", 64);
  return secret ? recommenderBySecret(secret) : currentRecommender();
}

/**
 * «Посоветовать другу»: a personal link to a venue. A browser that already
 * has a recommender reuses it; otherwise name, phone and consent make one and
 * the browser remembers it.
 */
export async function createPick(_prev: FormState, fd: FormData): Promise<FormState> {
  const lang = langOf(fd);
  const t = dicts[lang];
  if (str(fd, "website")) return { ok: true };
  const venueId = str(fd, "venue_id", 40);
  if (!isUuid(venueId)) return { error: t.errors.generic };
  const note = strOrNull(fd, "note", 200);
  const sql = db();

  let rec = await currentRecommender();
  if (!rec) {
    const name = str(fd, "name", 60);
    const phoneRaw = str(fd, "phone", 40);
    const phone = normalizePhone(phoneRaw);
    const fe: Record<string, string> = {};
    if (!name) fe.name = t.errors.required;
    if (!phoneRaw) fe.phone = t.errors.required;
    else if (!phone) fe.phone = t.errors.phone;
    if (!bool(fd, "consent")) fe.consent = t.errors.consent;
    if (Object.keys(fe).length) return { fieldErrors: fe, error: t.errors.form, values: { name, phone: phoneRaw, note: note ?? "" } };
    const secret = newSecret();
    [rec] = await sql<Recommender[]>`
      insert into recommenders (name, phone, secret, consent, lang) values (${name}, ${phone}, ${secret}, true, ${lang})
      returning id, name, phone, secret`;
    await rememberRecommender(secret);
  }

  try {
    const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from picks where recommender_id = ${rec.id}`;
    const [existing] = await sql<{ code: string }[]>`select code from picks where recommender_id = ${rec.id} and venue_id = ${venueId}`;
    let code = existing?.code;
    if (existing) {
      await sql`update picks set note = coalesce(${note}, note), active = true where recommender_id = ${rec.id} and venue_id = ${venueId}`;
    } else {
      if (n >= MAX_PICKS) return { error: t.blat.tooMany };
      const [venue] = await sql`select 1 from venues where id = ${venueId} and status = 'active'`;
      if (!venue) return { error: t.invite.inactiveTitle };
      for (let i = 0; i < 5 && !code; i++) {
        const c = newPickCode();
        const rows = await sql<{ code: string }[]>`
          insert into picks (recommender_id, venue_id, code, note) values (${rec.id}, ${venueId}, ${c}, ${note})
          on conflict (code) do nothing returning code`;
        code = rows[0]?.code;
      }
      if (!code) return { error: t.errors.generic };
    }
    revalidatePath("/blat");
    return { ok: true, values: { url: `${siteUrl()}/p/${code}`, name: rec.name } };
  } catch (e) {
    console.error("pick failed", e);
    return { error: t.errors.generic };
  }
}

/** Points → a treat: the points leave the balance now, the hostess marks the code. */
export async function redeemReward(_prev: FormState, fd: FormData): Promise<FormState> {
  const t = dicts[langOf(fd)];
  const rec = await actor(fd);
  const rewardId = str(fd, "reward_id", 40);
  if (!rec || !isUuid(rewardId)) return { error: t.errors.generic };
  const sql = db();
  try {
    const res = await sql.begin(async (tx) => {
      // One redemption at a time per recommender: the row lock serialises them.
      await tx`select id from recommenders where id = ${rec.id} for update`;
      const [w] = await tx<{ id: string; venue_id: string; cost: number }[]>`
        select w.id, w.venue_id, w.cost from blat_rewards w join venues v on v.id = w.venue_id
        where w.id = ${rewardId} and w.active and v.status = 'active'`;
      if (!w) return { error: t.errors.generic };
      const [{ n }] = await tx<{ n: number }[]>`select coalesce(sum(delta), 0)::int as n from blat_points where recommender_id = ${rec.id}`;
      if (n < w.cost) return { error: t.blat.notEnough };
      let id: string | undefined;
      for (let i = 0; i < 8 && !id; i++) {
        const rows = await tx<{ id: string }[]>`
          insert into blat_redemptions (recommender_id, reward_id, venue_id, code)
          values (${rec.id}, ${w.id}, ${w.venue_id}, ${newRedeemCode()})
          on conflict (code) do nothing returning id`;
        id = rows[0]?.id;
      }
      if (!id) return { error: t.errors.generic };
      await tx`insert into blat_points (recommender_id, delta, reason, redemption_id) values (${rec.id}, ${-w.cost}, 'redeem', ${id})`;
      return { ok: true } as FormState;
    });
    revalidatePath("/blat");
    revalidatePath(`/b/${rec.secret}`);
    return res;
  } catch (e) {
    console.error("redeem failed", e);
    return { error: t.errors.generic };
  }
}

/** A code not yet shown: cancel it and the points come back. */
export async function cancelRedemption(fd: FormData): Promise<void> {
  const rec = await actor(fd);
  const id = str(fd, "id", 40);
  if (!rec || !isUuid(id)) return;
  await db().begin(async (tx) => {
    const [r] = await tx<{ id: string }[]>`
      update blat_redemptions set status = 'cancelled'
      where id = ${id} and recommender_id = ${rec.id} and status = 'issued' returning id`;
    if (r) await tx`delete from blat_points where redemption_id = ${r.id}`;
  });
  revalidatePath("/blat");
  revalidatePath(`/b/${rec.secret}`);
}

/** The private link opened on another phone: remember it there too. */
export async function rememberHere(fd: FormData): Promise<void> {
  const rec = await recommenderBySecret(str(fd, "secret", 64));
  if (rec) await rememberRecommender(rec.secret);
  revalidatePath("/blat");
}
