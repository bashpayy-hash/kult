import Link from "next/link";
import { publicImageUrl } from "@/lib/storage";
import { sceneFor } from "@/lib/scenes";
import type { Dict, Lang } from "@/lib/i18n/dicts";
import type { CatalogVenue } from "@/lib/venueData";

function Picture({ v, sizes, className = "" }: { v: CatalogVenue; sizes: string; className?: string }) {
  const own = publicImageUrl(v.photo_path);
  const scene = sceneFor(v.category);
  return own ? (
    <img src={own} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
  ) : (
    <img src={scene.src} srcSet={scene.srcSet} sizes={sizes} alt="" loading="lazy" className={`h-full w-full object-cover ${className}`} />
  );
}

/** «Популярные заведения»: a square picture with the name under it. */
export function VenueTile({ v }: { v: CatalogVenue }) {
  return (
    <Link href={`/v/${v.slug}`} className="group flex w-[9.5rem] shrink-0 snap-start flex-col gap-3 md:w-[11rem]">
      <span className="block aspect-square overflow-hidden rounded-tile-r bg-tile">
        <Picture v={v} sizes="176px" className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
      </span>
      <span className="truncate text-center font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">{v.name}</span>
    </Link>
  );
}

/** A venue card: picture, then name and one line of facts. Optional perk badge. */
export function VenueCard({ v, t, lang, perk = false, wide = false }: { v: CatalogVenue; t: Dict; lang: Lang; perk?: boolean; wide?: boolean }) {
  const badge = perk ? (lang === "kk" && v.perk_kk) || v.perk : null;
  return (
    <Link
      href={`/v/${v.slug}`}
      className={`group flex shrink-0 snap-start flex-col overflow-hidden rounded-tile-r bg-tile transition-colors duration-150 hover:bg-raised ${
        wide ? "w-full" : "w-[17rem] md:w-[20rem]"
      }`}
    >
      <span className="relative block aspect-[4/3] overflow-hidden">
        <Picture v={v} sizes={wide ? "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw" : "320px"} className="transition-transform duration-500 ease-out group-hover:scale-[1.03]" />
        {badge ? (
          <span className="absolute left-3 top-3 line-clamp-2 max-w-[calc(100%-1.5rem)] rounded-[14px] bg-canvas/85 px-3 py-1.5 text-[13px] font-semibold leading-snug text-ink">
            {badge}
          </span>
        ) : null}
      </span>
      <span className="flex flex-col gap-1 px-5 py-4">
        <span className="truncate font-display text-[19px] font-semibold tracking-[-0.025em] text-ink">{v.name}</span>
        <span className="truncate text-[14px] text-ink-3">{[t.categories[v.category], v.address].filter(Boolean).join(" · ")}</span>
      </span>
    </Link>
  );
}

/** A horizontally scrolling row that bleeds to the screen edge on phones. */
export function Rail({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2 [scrollbar-width:none] md:-mx-6 md:px-6 min-[900px]:mx-0 min-[900px]:px-0">
      <div className="flex snap-x gap-3">{children}</div>
    </div>
  );
}
