import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { getVisitor } from "@/lib/visitor";
import { publicImageUrl } from "@/lib/storage";
import { loadPlan } from "@/lib/venueData";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { VenueView } from "@/components/VenueView";
import { loadInvite } from "./data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ member: string; venue: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { member, venue } = await params;
  const d = await loadInvite(member, venue);
  if (!d) return { title: "Бөлек", robots: { index: false, follow: false } };
  const photo = publicImageUrl(d.photo_path);
  return {
    title: d.venue_name,
    description: d.perk || d.description || undefined,
    robots: { index: false, follow: false },
    openGraph: { title: `${d.venue_name} · Бөлек`, description: d.perk || undefined, images: photo ? [photo] : undefined },
  };
}

/** A member's personal link: the venue page plus who invited and the entry phrase. */
export default async function InvitePage({ params }: Props) {
  const { member, venue } = await params;
  const d = await loadInvite(member, venue);
  if (!d) notFound();

  const { lang, t } = await getDict();
  const active = d.link_active && d.member_active && d.venue_active;

  // Every open of the page is a click. Logged after the response is sent, so
  // the guest never waits for it. Link previews and bots are kept but flagged.
  if (active) {
    const v = await getVisitor();
    if (!v.isPrefetch) {
      after(async () => {
        try {
          await db()`
            insert into link_clicks (tracking_link_id, visitor_hash, referrer, user_agent, is_bot, lang)
            values (${d.link_id}, ${v.hash}, ${v.referrer}, ${v.userAgent}, ${v.isBot}, ${lang})`;
        } catch (e) {
          console.error("click log failed", e);
        }
      });
    }
  }

  const plan = await loadPlan(d.venue_id);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <VenueView
          d={d}
          lang={lang}
          t={t}
          plan={plan}
          active={active}
          invite={{ linkId: d.link_id, memberName: d.member_name, memberSlug: d.member_slug, phrase: d.code_phrase || t.invite.phraseDefault(d.member_name) }}
        />
      </main>
      <SiteFooter t={t} />
    </>
  );
}
