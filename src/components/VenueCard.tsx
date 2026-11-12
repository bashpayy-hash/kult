import Link from "next/link";
import { publicImageUrl } from "@/lib/storage";
import { coverFor } from "@/lib/covers";
import { clock, openNow } from "@/lib/booking";
import { formatMoney } from "@/lib/format";
import { Plate } from "@/components/Plate";
import type { Dict, Lang } from "@/lib/i18n/dicts";
import type { CatalogVenue, FreeSlots } from "@/lib/venueData";

/**
 * A catalog entry, Annual Report DNA: a printed 4:5 plate (the venue's own
 * photo, else its category's collage) with the name set small on its paper
 * margin, then plain caption lines and a timetable of the next free times.
 * No card, no rounded box: the page ground carries it.
 */
export function VenueCard({ v, t, lang, free, nowMin }: { v: CatalogVenue; t: Dict; lang: Lang; free?: FreeSlots; nowMin: number }) {
  const C = t.catalog;
  const photo = publicImageUrl(v.photo_path);
  const cover = coverFor(v.category);
  const perk = (lang === "kk" && v.perk_kk) || v.perk;
  const state = openNow(v, nowMin);
  const facts = [v.address, v.avg_check ? `${C.avgCheck} ${formatMoney(v.avg_check)}` : null, state.open ? C.openUntil(state.at) : C.opensAt(state.at)].filter(Boolean);

  return (
    <article className="relative flex h-full flex-col">
      <Link href={`/v/${v.slug}`} className="block transition-opacity duration-200 hover:opacity-90" aria-label={v.name}>
        <Plate
          src={photo ?? cover.src}
          srcSet={photo ? undefined : cover.srcSet}
          sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 92vw"
          bg={cover.bg}
          left={v.name}
          right={t.categories[v.category]}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 pt-4">
        <h3 className="text-[22px]">
          <Link href={`/v/${v.slug}`} className="hover:underline hover:decoration-1 hover:underline-offset-4">
            {v.name}
          </Link>
        </h3>
        <p className="text-[15px] text-ink-2">{facts.join(" · ")}</p>
        {perk ? (
          <p className="text-[15px] text-ink-2">
            <span className="text-ink-3">{C.bonus}: </span>
            {perk}
          </p>
        ) : null}
        <div className="mt-auto border-t border-line pt-3">
          {free ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[13px] font-medium text-ink-3">{free.day === "today" ? C.freeToday : C.freeTomorrow}</span>
              {free.slots.map((m) => (
                <Link key={m} href={`/v/${v.slug}?d=${free.date}&t=${m}#book`} className="cell numerals text-[19px]">
                  {clock(m)}
                </Link>
              ))}
            </div>
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
    <div className="-mx-5 overflow-x-auto px-5 [scrollbar-width:none] md:mx-0 md:px-0">
      <div className="flex">{children}</div>
    </div>
  );
}
