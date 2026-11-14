"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { PlanCamera, type CameraStrings, type PlanLayers } from "./PlanCamera";

export type MapVenue = {
  n: number;
  name: string;
  category: string;
  href: string;
  /** Nearest free time, as on the catalog card; opens the booking. */
  slot?: { label: string; day: string; href: string };
  left: number;
  top: number;
};

export type MapCity = {
  key: string;
  name: string;
  /** Beside the city's tab: «6 мест» or «скоро». */
  note: string;
  /** Over an empty plan: «Астана: открываемся». */
  soonTitle: string;
  aspect: number;
  /** A street plan exists in public/maps/<key>.svg (src/lib/cityPlans.generated.json). */
  plan: boolean;
  /** One kilometre, in percent of the plan's width and height (grid cells). */
  kmX: number;
  kmY: number;
  /** The city on the country inset, in percent. */
  onCountry: { left: number; top: number };
  /** A line along the plan's bottom edge (Almaty's mountains). */
  edge?: string;
  /** The detailed, zoomable plan (Almaty since 14 Nov 2026); without it the grid plate. */
  layers?: PlanLayers;
  venues: MapVenue[];
};

type Strings = { soonText: string; soonCta: string; credit: string; km: string; countryAlt: string; countryCredit: string; camera: CameraStrings; showOnMap: string };

const GRID = "rgba(109, 76, 46, 0.2)"; // paper-ink-3 at 20%: the survey grid on the paper

/**
 * Where бөлек is (12 Nov 2026, owner: «добавить карту Алматы и Астаны по
 * местам ... покажет скейл проекта»). Left: the chosen city as a printed
 * survey plate — a one-kilometre grid on paper, the street plan from
 * OpenStreetMap over it when the build could draw one, the places as
 * numbered squares at their real coordinates. Right: Kazakhstan with both
 * cities on it (switches the plate), then the places as a list with the same
 * numbers. A city with no places shows its plate with an invitation for
 * venues: the map tells where the project is going without inventing places.
 */
export function CityMap({ title, cities, s }: { title: string; cities: MapCity[]; s: Strings }) {
  const [key, setKey] = useState(cities[0]?.key);
  const [active, setActive] = useState<number | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const plate = useRef<HTMLDivElement>(null);
  const city = cities.find((c) => c.key === key) ?? cities[0];
  if (!city) return null;
  const pick = (k: string) => {
    setKey(k);
    setActive(null);
    setFocus(null);
  };

  return (
    <>
      <div className="reveal flex flex-col gap-4 border-b border-line md:flex-row md:items-end md:justify-between">
        <h2 id="map-title" className="text-[28px] md:text-[36px]">
          {title}
        </h2>
        <div className="flex" role="group" aria-label={cities.map((c) => c.name).join(", ")}>
          {cities.map((c) => (
            <button key={c.key} type="button" aria-current={c.key === city.key ? "true" : undefined} onClick={() => pick(c.key)} className="chip shrink-0">
              {c.name}
              <span className="ml-2 text-ink-3">{c.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[7fr_5fr] md:gap-12">
        <div ref={plate} className="min-w-0 scroll-mt-6">
        {city.layers ? (
          <PlanCamera key={city.key} city={city} layers={city.layers} active={active} setActive={setActive} focus={focus} setFocus={setFocus} s={s.camera} />
        ) : (
        <figure className="min-w-0">
          <div className="bg-paper p-2 sm:p-2.5">
            <div
              className="plate-view relative w-full overflow-hidden"
              style={{
                aspectRatio: String(city.aspect),
                // The street plan (if the build drew one) over the 1 km grid.
                backgroundImage: `${city.plan ? `url(/maps/${city.key}.svg), ` : ""}linear-gradient(to right, ${GRID} 1px, transparent 1px), linear-gradient(to bottom, ${GRID} 1px, transparent 1px)`,
                backgroundSize: `${city.plan ? "100% 100%, " : ""}${city.kmX}% ${city.kmY}%, ${city.kmX}% ${city.kmY}%`,
                backgroundRepeat: city.plan ? "no-repeat, repeat, repeat" : "repeat",
              }}
            >
              <p className="absolute left-3 top-2.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-paper-ink-3">{city.name}</p>
              {city.edge ? <p className="absolute inset-x-0 bottom-2 text-center text-[12px] font-medium tracking-[0.04em] text-paper-ink-3">{city.edge}</p> : null}
              {city.venues.map((v) => (
                <Link
                  key={v.n}
                  href={v.href}
                  aria-label={`${v.n}. ${v.name}`}
                  onMouseEnter={() => setActive(v.n)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(v.n)}
                  onBlur={() => setActive(null)}
                  // A 44px target around a 24px square, centred on the point.
                  className="pin group absolute grid h-11 w-11 -translate-x-1/2 -translate-y-1/2 place-items-center outline-none"
                  style={{ left: `${v.left}%`, top: `${v.top}%`, zIndex: active === v.n ? 2 : 1, ["--n" as string]: v.n - 1 }}
                >
                  <span
                    className={`num grid h-6 min-w-6 place-items-center px-1 text-[12px] leading-none text-paper transition-transform duration-150 group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-[var(--color-paper-ink)] ${active === v.n ? "scale-125 bg-navy" : "bg-oxblood"}`}
                  >
                    {v.n}
                  </span>
                </Link>
              ))}
              {!city.venues.length ? (
                <div className="absolute inset-0 grid place-items-center p-6">
                  <div className="max-w-[22rem] border border-paper-line bg-paper px-6 py-5 text-center text-paper-ink">
                    <p className="text-[20px] font-semibold tracking-[-0.02em]">{city.soonTitle}</p>
                    <p className="mt-2 text-[15px] text-paper-ink-2">{s.soonText}</p>
                    <Link href="/join#partners" className="btn btn-ink btn-sm mt-4">
                      {s.soonCta}
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <figcaption className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
            {/* 2 km at the plate's scale: the bar is a direct child, so its
                percentage is of the plate's width. */}
            <span aria-hidden="true" className="block h-[5px] border-x border-b border-ink-3" style={{ width: `${city.kmX * 2}%` }} />
            <span className="num">2 {s.km}</span>
            {!city.plan ? null : (
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="link-quiet ml-auto text-ink-3">
                {s.credit}
              </a>
            )}
          </figcaption>
        </figure>
        )}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {/* Kazakhstan with both cities: the project's reach at a glance. */}
          <div className="relative w-full" style={{ aspectRatio: "1000 / 546.8" }}>
            <img src="/maps/kazakhstan.svg" alt={s.countryAlt} className="absolute inset-0 h-full w-full" loading="lazy" />
            {cities.map((c) => {
              const on = c.key === city.key;
              // Labels sit toward the inside of the country: Astana's below
              // its point, Almaty's above (it lies on the southern border).
              const below = c.onCountry.top < 50;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => pick(c.key)}
                  aria-pressed={on}
                  className="absolute flex items-center gap-1 outline-none [&:focus-visible>span:first-child]:outline [&:focus-visible>span:first-child]:outline-2 [&:focus-visible>span:first-child]:outline-offset-2 [&:focus-visible>span:first-child]:outline-[var(--color-paper-ink)]"
                  style={{ left: `${c.onCountry.left}%`, top: `${c.onCountry.top}%`, transform: `translate(-50%, ${below ? "-6px" : "calc(-100% + 6px)"})`, flexDirection: below ? "column" : "column-reverse" }}
                >
                  <span className="relative block h-3 w-3">
                    {on ? <span aria-hidden="true" className="pulse-ring absolute inset-0 border-2 border-oxblood" /> : null}
                    <span className={`absolute inset-0 ${on ? "bg-oxblood" : "border-2 border-oxblood bg-paper"}`} />
                  </span>
                  <span className={`whitespace-nowrap px-1.5 py-0.5 text-[12px] font-semibold ${on ? "bg-oxblood text-paper" : "bg-paper text-paper-ink"}`}>
                    {c.name} · {c.note}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="-mt-4 text-[12px] text-ink-3">{s.countryCredit}</p>

          {city.venues.length ? (
            <ol className="border-t border-line">
              {city.venues.map((v) => (
                <li
                  key={v.n}
                  onMouseEnter={() => setActive(v.n)}
                  onMouseLeave={() => setActive(null)}
                  className="flex items-center gap-4 border-b border-line py-3"
                >
                  {city.layers ? (
                    // On the detailed plan the number flies the camera to the place.
                    <button
                      type="button"
                      onClick={() => {
                        setFocus(v.n);
                        const r = plate.current?.getBoundingClientRect();
                        if (r && (r.top < 0 || r.bottom > window.innerHeight)) plate.current?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
                      }}
                      aria-label={`${s.showOnMap}: ${v.name}`}
                      className="-m-2.5 grid h-11 w-11 shrink-0 place-items-center"
                    >
                      <span className={`num grid h-6 min-w-6 place-items-center px-1 text-[12px] ${active === v.n || focus === v.n ? "bg-accent text-paper-ink" : "bg-paper text-paper-ink"}`}>{v.n}</span>
                    </button>
                  ) : (
                  <span aria-hidden="true" className={`num grid h-6 min-w-6 shrink-0 place-items-center px-1 text-[12px] text-paper ${active === v.n ? "bg-navy" : "bg-oxblood"}`}>
                    {v.n}
                  </span>
                  )}
                  <Link href={v.href} className="group min-w-0 flex-1">
                    <span className={`block truncate text-[16px] font-medium transition-colors duration-150 group-hover:text-accent ${active === v.n ? "text-accent" : "text-ink"}`}>{v.name}</span>
                    <span className="block text-[13px] text-ink-3">{v.category}</span>
                  </Link>
                  {v.slot ? (
                    <Link href={v.slot.href} className="shrink-0 text-right" aria-label={`${v.name}: ${v.slot.day}, ${v.slot.label}`}>
                      <span className="numerals block text-[24px] leading-none text-ink">{v.slot.label}</span>
                      <span className="block text-[12px] text-ink-3">{v.slot.day}</span>
                    </Link>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </div>
      </div>
    </>
  );
}
