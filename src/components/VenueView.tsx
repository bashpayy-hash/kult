import { BookingWidget } from "@/components/BookingWidget";
import { Monogram } from "@/components/Monogram";
import { openNow, type PlanHall, type PlanItem, type VenueHours } from "@/lib/booking";
import { almatyNowMinutes, almatyToday, formatMoney, instagramHandle } from "@/lib/format";
import { publicImageUrl } from "@/lib/storage";
import { coverFor } from "@/lib/covers";
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
  logo_path: string | null;
  avg_check: number | null;
  hours: VenueHours;
  perk: string | null;
  perk_kk: string | null;
  terms: string | null;
};

const SERVICE: Category[] = ["beauty", "wellness", "fitness"];

/**
 * One layout for the catalog page (/v/<venue>) and a member's invite
 * (/<member>/<venue>): facts on the left, booking on the right. The venue's
 * own photo if it has one, otherwise its category's retro cover.
 */
export function VenueView({
  d,
  lang,
  t,
  plan,
  active,
  invite,
  initial,
}: {
  d: VenueViewData;
  lang: Lang;
  t: Dict;
  plan: { halls: PlanHall[]; items: PlanItem[] };
  active: boolean;
  invite?: { linkId: string; memberName: string; memberSlug: string; phrase: string };
  initial?: { date?: string; slot?: number };
}) {
  const photo = publicImageUrl(d.photo_path);
  const logo = publicImageUrl(d.logo_path);
  const cover = coverFor(d.category);
  const perk = (lang === "kk" && d.perk_kk) || d.perk;
  const description = (lang === "kk" && d.description_kk) || d.description;
  const ig = instagramHandle(d.instagram);
  const b = t.booking;
  const C = t.catalog;
  const state = openNow(d.hours, almatyNowMinutes());
  const facts = [state.open ? C.openUntil(state.at) : C.opensAt(state.at), d.avg_check ? `${C.avgCheck} ${formatMoney(d.avg_check)}` : null].filter(Boolean);

  return (
    <div className="grid gap-10 md:grid-cols-[1fr_1fr] md:gap-12 lg:gap-16">
      <div className="flex min-w-0 flex-col gap-6">
        <div className="rise aspect-[3/2] overflow-hidden rounded-tile-r" style={{ background: cover.bg }}>
          {photo ? (
            <img src={photo} alt={d.venue_name} className="h-full w-full object-cover" fetchPriority="high" />
          ) : (
            // Not a photo of the venue: the category's 1950s cover.
            <img src={cover.src} srcSet={cover.srcSet} sizes="(min-width: 768px) 50vw, 100vw" alt="" className="h-full w-full object-cover" fetchPriority="high" />
          )}
        </div>

        <div className="rise rise-1">
          {invite ? (
            <p className="mb-5 flex items-center gap-2.5 text-[15px] text-ink-2">
              <Monogram name={invite.memberName} size={28} />
              {t.invite.from(invite.memberName)}
            </p>
          ) : null}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="label">{[t.categories[d.category], d.address].filter(Boolean).join(" · ")}</p>
              <h1 className="mt-2 text-[38px] md:text-[52px]">{d.venue_name}</h1>
            </div>
            {logo ? <img src={logo} alt="" className="h-16 w-16 shrink-0 rounded-[var(--radius-inner)] bg-raised object-contain" /> : null}
          </div>
          <p className="mt-3 text-[16px] text-ink-2">
            {facts.join(" · ")}
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
            <h2 className="text-[24px]">{t.invite.inactiveTitle}</h2>
            <p className="mt-2 text-ink-2">{t.invite.inactiveText}</p>
          </div>
        ) : (
          <div className="rise rise-2 grid gap-3">
            {perk ? (
              <div className="rounded-tile-r border border-line p-6 md:p-7">
                <p className="label">{invite ? t.invite.perkTitle : b.perkTitle}</p>
                <p className="mt-2 text-[20px] font-semibold leading-snug tracking-[-0.02em] text-ink md:text-[22px]">{perk}</p>
                {d.terms ? <p className="mt-2 text-[14px] text-ink-3">{d.terms}</p> : null}
              </div>
            ) : null}
            {invite ? (
              <div className="rounded-tile-r border border-line p-6 md:p-7">
                <p className="label">{t.invite.phraseTitle}</p>
                <p className="mt-2 font-display text-[28px] font-semibold leading-tight tracking-[-0.035em] text-ink md:text-[32px]">«{invite.phrase}»</p>
                <p className="mt-2 text-[15px] text-ink-2">{t.invite.phraseHint}</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {active ? (
        <section id="book" aria-labelledby="book-title" className="rise rise-3 min-w-0 scroll-mt-4 md:pt-1">
          <div className="rounded-tile-r bg-tile p-5 sm:p-8">
            <h2 id="book-title" className="text-[26px] md:text-[30px]">
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
                initialDate={initial?.date}
                initialSlot={initial?.slot}
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
