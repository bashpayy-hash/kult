import Link from "next/link";
import { publicImageUrl } from "@/lib/storage";
import { clock, openNow } from "@/lib/booking";
import { formatMoney } from "@/lib/format";
import type { Dict, Lang } from "@/lib/i18n/dicts";
import type { CatalogVenue, FreeSlots } from "@/lib/venueData";

/**
 * A catalog card that helps choose (12 Nov 2026, owner: «иллюстрации
 * слишком слопные, там по сути должны быть реальные картинки заведений»):
 * the venue's own photo if it has one, otherwise no picture at all — the
 * name set large. Facts that decide: check, hours, the next free times, each
 * a link straight into the booking with that time picked.
 */
export function VenueCard({ v, t, lang, free, nowMin }: { v: CatalogVenue; t: Dict; lang: Lang; free?: FreeSlots; nowMin: number }) {
  const C = t.catalog;
  const photo = publicImageUrl(v.photo_path);
  const logo = publicImageUrl(v.logo_path);
  const perk = (lang === "kk" && v.perk_kk) || v.perk;
  const state = openNow(v, nowMin);
  const facts = [
    v.avg_check ? `${C.avgCheck} ${formatMoney(v.avg_check)}` : null,
    state.open ? C.openUntil(state.at) : C.opensAt(state.at),
  ].filter(Boolean);

  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-tile-r bg-tile">
      {photo ? (
        <div className="aspect-[16/10] overflow-hidden bg-raised">
          <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-4 p-5 md:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label">{[t.categories[v.category], v.address].filter(Boolean).join(" · ")}</p>
            <h3 className={`mt-2 ${photo ? "text-[24px]" : "text-[30px] md:text-[34px]"}`}>
              {/* Stretched link: the whole card opens the venue; slot links sit above it. */}
              <Link href={`/v/${v.slug}`} className="after:absolute after:inset-0 after:content-['']">
                {v.name}
              </Link>
            </h3>
          </div>
          {logo ? <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-[var(--radius-inner)] bg-raised object-contain" /> : null}
        </div>
        <p className="text-[15px] text-ink-2">{facts.join(" · ")}</p>
        {perk ? (
          <p className="text-[15px] text-ink-2">
            <span className="text-ink-3">{C.bonus}: </span>
            {perk}
          </p>
        ) : null}
        <div className="mt-auto pt-1">
          {free ? (
            <>
              <p className="label">{free.day === "today" ? C.freeToday : C.freeTomorrow}</p>
              <div className="relative z-10 mt-2 flex flex-wrap gap-2">
                {free.slots.map((m) => (
                  <Link key={m} href={`/v/${v.slug}?d=${free.date}&t=${m}#book`} className="chip min-h-11 px-4 tabular-nums">
                    {clock(m)}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="text-[14px] text-ink-3">{C.noFree}</p>
          )}
        </div>
      </div>
    </article>
  );
}

/** A horizontally scrolling row that bleeds to the screen edge on phones. */
export function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] md:-mx-6 md:px-6 min-[900px]:mx-0 min-[900px]:px-0">
      <div className="flex gap-2">{children}</div>
    </div>
  );
}
