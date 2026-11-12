import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { getVisitor } from "@/lib/visitor";
import { publicImageUrl } from "@/lib/storage";
import { almatyToday, instagramHandle } from "@/lib/format";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Orb, toneFor } from "@/components/Orb";
import { loadInvite } from "./data";
import { BookingForm } from "./BookingForm";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ member: string; venue: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { member, venue } = await params;
  const d = await loadInvite(member, venue);
  if (!d) return { title: "Kult", robots: { index: false, follow: false } };
  const photo = publicImageUrl(d.photo_path);
  return {
    title: d.venue_name,
    description: d.guest_perk || d.description || undefined,
    robots: { index: false, follow: false },
    openGraph: { title: `${d.venue_name} · Kult`, description: d.guest_perk || undefined, images: photo ? [photo] : undefined },
  };
}

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

  const photo = publicImageUrl(d.photo_path);
  const perk = (lang === "kk" && d.guest_perk_kk) || d.guest_perk;
  const description = (lang === "kk" && d.description_kk) || d.description;
  const phrase = d.code_phrase || t.invite.phraseDefault(d.member_name);
  const ig = instagramHandle(d.instagram);

  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <div className="grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-12 lg:gap-16">
          <div className="flex flex-col gap-6">
            <div className="rise relative aspect-[4/3] overflow-hidden rounded-tile-r bg-tile">
              {photo ? (
                <img src={photo} alt={d.venue_name} className="h-full w-full object-cover" fetchPriority="high" />
              ) : (
                <div aria-hidden="true" className="absolute inset-0 grid place-items-center">
                  <Orb tone={toneFor(d.venue_slug)} size="46%" />
                </div>
              )}
            </div>

            <div className="rise rise-1">
              <p className="flex items-center gap-2.5 text-[15px] text-ink-2">
                <Orb tone={toneFor(d.member_slug)} size={22} still />
                {t.invite.from(d.member_name)}
              </p>
              <h1 className="mt-4 text-[44px] md:text-[56px]">{d.venue_name}</h1>
              <p className="mt-3 text-[15px] text-ink-3">
                {[t.categories[d.category], d.address].filter(Boolean).join(" · ")}
                {ig ? (
                  <>
                    {" · "}
                    <a href={`https://instagram.com/${ig}`} target="_blank" rel="noopener noreferrer" className="link-quiet">
                      Instagram
                    </a>
                  </>
                ) : null}
              </p>
              {description ? <p className="mt-5 max-w-[36rem] text-[16px] text-ink-2">{description}</p> : null}
            </div>

            {!active ? (
              <div className="rounded-tile-r bg-tile p-6 md:p-8">
                <h2 className="text-[30px]">{t.invite.inactiveTitle}</h2>
                <p className="mt-2 text-ink-2">{t.invite.inactiveText}</p>
              </div>
            ) : (
              <div className="rise rise-2 grid gap-3">
                {perk ? (
                  <div className="rounded-tile-r bg-tile p-6 md:p-8">
                    <p className="label">{t.invite.perkTitle}</p>
                    <p className="mt-3 font-serif text-[28px] leading-tight text-ink md:text-[32px]">{perk}</p>
                    {d.terms ? <p className="mt-3 text-[14px] text-ink-3">{d.terms}</p> : null}
                  </div>
                ) : null}
                <div className="rounded-tile-r bg-tile p-6 md:p-8">
                  <p className="label">{t.invite.phraseTitle}</p>
                  <p className="mt-3 font-serif text-[34px] italic leading-tight text-ink md:text-[40px]">«{phrase}»</p>
                  <p className="mt-3 text-[15px] text-ink-2">{t.invite.phraseHint}</p>
                </div>
              </div>
            )}
          </div>

          {active ? (
            <section aria-labelledby="book" className="rise rise-3 md:pt-1">
              <div className="rounded-tile-r bg-tile p-6 sm:p-8">
                <h2 id="book" className="text-[34px] md:text-[40px]">
                  {t.invite.bookingTitle}
                </h2>
                <div className="mt-6">
                  <BookingForm lang={lang} linkId={d.link_id} phrase={phrase} today={almatyToday()} />
                </div>
              </div>
            </section>
          ) : null}
        </div>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
