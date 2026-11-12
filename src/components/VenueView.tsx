import { BookingWidget } from "@/components/BookingWidget";
import { Orb, toneFor } from "@/components/Orb";
import { clock, toMinutes, type PlanHall, type PlanItem, type VenueHours } from "@/lib/booking";
import { almatyToday, instagramHandle } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import { sceneFor } from "@/lib/scenes";
import type { Dict, Lang } from "@/lib/i18n/dicts";
import type { Category } from "@/lib/types";

export type VenueViewData = {
  venue_id: string;
  venue_name: string;
  category: Category;
  description: string | null;
  description_kk: string | null;
  address: string | null;
  instagram: string | null;
  photo_path: string | null;
  hours: VenueHours;
  perk: string | null;
  perk_kk: string | null;
  terms: string | null;
};

const SERVICE: Category[] = ["beauty", "wellness", "fitness"];

/**
 * One layout for the catalog page (/v/<venue>) and a member's invite
 * (/<member>/<venue>): picture and facts on the left, booking on the right.
 * The invite adds who sent the guest and the entry phrase.
 */
export function VenueView({
  d,
  lang,
  t,
  plan,
  active,
  invite,
}: {
  d: VenueViewData;
  lang: Lang;
  t: Dict;
  plan: { halls: PlanHall[]; items: PlanItem[] };
  active: boolean;
  invite?: { linkId: string; memberName: string; memberSlug: string; phrase: string };
}) {
  const photo = publicImageUrl(d.photo_path);
  const scene = sceneFor(d.category);
  const perk = (lang === "kk" && d.perk_kk) || d.perk;
  const description = (lang === "kk" && d.description_kk) || d.description;
  const ig = instagramHandle(d.instagram);
  const b = t.booking;
  const hours = b.hours(clock(toMinutes(d.hours.open_time)), clock(toMinutes(d.hours.close_time)));

  return (
    <div className="grid gap-10 md:grid-cols-[1.05fr_0.95fr] md:gap-12 lg:gap-16">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="rise relative aspect-[4/3] overflow-hidden rounded-tile-r bg-tile">
          {photo ? (
            <img src={photo} alt={d.venue_name} className="h-full w-full object-cover" fetchPriority="high" />
          ) : (
            // No photo yet: the category scene from the Higgsfield set.
            <img src={scene.src} srcSet={scene.srcSet} sizes="(min-width: 768px) 55vw, 100vw" alt="" className="h-full w-full object-cover" fetchPriority="high" />
          )}
        </div>

        <div className="rise rise-1">
          {invite ? (
            <p className="mb-4 flex items-center gap-2.5 text-[15px] text-ink-2">
              <Orb tone={toneFor(invite.memberSlug)} size={22} still />
              {t.invite.from(invite.memberName)}
            </p>
          ) : null}
          <h1 className="text-[38px] md:text-[48px]">{d.venue_name}</h1>
          <p className="mt-3 text-[15px] text-ink-3">
            {[t.categories[d.category], d.address, hours].filter(Boolean).join(" · ")}
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
            <h2 className="text-[26px]">{t.invite.inactiveTitle}</h2>
            <p className="mt-2 text-ink-2">{t.invite.inactiveText}</p>
          </div>
        ) : (
          <div className="rise rise-2 grid gap-3">
            {perk ? (
              <div className="rounded-tile-r bg-tile p-6 md:p-8">
                <p className="label">{invite ? t.invite.perkTitle : b.perkTitle}</p>
                <p className="mt-3 font-display text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink md:text-[28px]">{perk}</p>
                {d.terms ? <p className="mt-3 text-[14px] text-ink-3">{d.terms}</p> : null}
              </div>
            ) : null}
            {invite ? (
              <div className="rounded-tile-r bg-tile p-6 md:p-8">
                <p className="label">{t.invite.phraseTitle}</p>
                <p className="mt-3 font-display text-[30px] font-semibold leading-tight tracking-[-0.035em] text-accent md:text-[36px]">«{invite.phrase}»</p>
                <p className="mt-3 text-[15px] text-ink-2">{t.invite.phraseHint}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {active ? (
        <section aria-labelledby="book" className="rise rise-3 min-w-0 md:pt-1">
          <div className="rounded-tile-r bg-tile p-5 sm:p-8">
            <h2 id="book" className="text-[28px] md:text-[32px]">
              {SERVICE.includes(d.category) ? b.titleService : b.title}
            </h2>
            <div className="mt-6">
              <BookingWidget
                lang={lang}
                venueId={d.venue_id}
                hours={d.hours}
                halls={plan.halls}
                items={plan.items}
                today={almatyToday()}
                linkId={invite?.linkId}
                phrase={invite?.phrase}
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
