"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { submitBooking } from "@/app/actions";
import { Consent, errProps, Field, FormError, Honeypot, SubmitButton } from "@/components/form";
import { FloorPlan, type TableState } from "@/components/FloorPlan";
import { clock, fits, isFree, isZone, slotList, toCalendar, ZONES, type PlanHall, type PlanItem, type Taken, type VenueHours, type Zone } from "@/lib/booking";
import { formatDay, shiftDate } from "@/lib/format";
import { dicts, type Lang } from "@/lib/i18n/dicts";
import type { FormState } from "@/lib/types";

type Props = {
  lang: Lang;
  venueId: string;
  hours: VenueHours;
  halls: PlanHall[];
  items: PlanItem[];
  today: string;
  /** Member link: the booking counts for her pair; the phrase is repeated on success. */
  linkId?: string;
  phrase?: string;
  /** From a catalog card: «20:00» was tapped, so open with that day and time. */
  initialDate?: string;
  initialSlot?: number;
  /** Guests to start with: 1 for services (beauty, wellness, fitness), 2 for tables. */
  defaultParty?: number;
};

const DAYS = 14;

/**
 * The booking flow: day → guests → where to sit (by the window, at the bar…)
 * → time → (optional) table on the plan → contacts. Slots and tables come from /api/availability; the server checks
 * everything again on submit.
 */
export function BookingWidget(props: Props) {
  // `key` restarts the flow after a successful booking («Ещё одна бронь»).
  const [round, setRound] = useState(0);
  return <Flow key={round} {...props} onAgain={() => setRound((r) => r + 1)} />;
}

function Flow({ lang, venueId, hours, halls, items, today, linkId, phrase, initialDate, initialSlot, defaultParty = 2, onAgain }: Props & { onAgain: () => void }) {
  const t = dicts[lang];
  const b = t.booking;
  const tables = useMemo(() => items.filter((i) => i.kind === "table"), [items]);
  const plannedHalls = halls.filter((h) => items.some((i) => i.hall_id === h.id && i.kind === "table"));

  const startDate = initialDate && initialDate >= today && initialDate <= shiftDate(today, DAYS - 1) ? initialDate : today;
  const [date, setDate] = useState(startDate);
  // A manicure or a pilates slot is usually for one; a table for two (uxaudit, 15 Nov 2026).
  const [party, setParty] = useState(defaultParty);
  const [slot, setSlot] = useState<number | null>(initialSlot ?? null);
  const [tableId, setTableId] = useState<string | null>(null);
  const [hallId, setHallId] = useState(plannedHalls[0]?.id ?? "");
  // Where to sit (15 Nov 2026, owner: «какой столик вам понравится у окна, у каунтера»).
  const [zone, setZone] = useState<Zone | null>(null);
  const zonesHere = ZONES.map((z) => ({ z, n: tables.filter((x) => x.zone === z).length })).filter((x) => x.n > 0);
  const inZone = (x: PlanItem) => !zone || x.zone === zone;
  const pickZone = (z: Zone | null) => {
    setZone(z);
    if (!z) return;
    // Show the hall where that place is.
    const h = plannedHalls.find((h) => tables.some((x) => x.hall_id === h.id && x.zone === z));
    if (h) setHallId(h.id);
  };
  // On a phone the plan scrolls sideways: bring the chosen place into view.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    const hall = halls.find((h) => h.id === hallId);
    const first = zone && hall ? tables.filter((x) => x.hall_id === hall.id && x.zone === zone).sort((a, b) => a.x - b.x)[0] : null;
    if (!el || !first || !hall || el.scrollWidth <= el.clientWidth) return;
    el.scrollTo({ left: Math.max(0, (first.x / hall.width) * el.scrollWidth - 24), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [zone, hallId, halls, tables]);
  // The venue's entry («Зал» step) can send the guest here with a place in mind.
  useEffect(() => {
    const on = (e: Event) => {
      const z = (e as CustomEvent).detail;
      if (isZone(z)) pickZone(z);
    };
    window.addEventListener("bolek:zone", on);
    return () => window.removeEventListener("bolek:zone", on);
  });
  const [avail, setAvail] = useState<{ date: string; taken: Taken[]; earliest: number } | null>(null);
  const [state, action] = useActionState<FormState, FormData>(submitBooking, {});

  useEffect(() => {
    let live = true;
    fetch(`/api/availability?venue=${venueId}&date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((j: { taken: Taken[]; earliest: number | null }) => {
        if (live) setAvail({ date, taken: j.taken, earliest: j.earliest ?? Number.POSITIVE_INFINITY });
      })
      .catch(() => live && setAvail({ date, taken: [], earliest: 0 }));
    return () => {
      live = false;
    };
  }, [venueId, date]);

  const loading = !avail || avail.date !== date;
  const taken = avail?.taken ?? [];
  const hold = hours.hold_minutes;

  const slotOpen = (m: number) =>
    !loading && m >= (avail?.earliest ?? 0) && (tables.length === 0 || tables.some((x) => inZone(x) && fits(x, party) && isFree(x.id, m, hold, taken)));
  const slots = slotList(hours);
  const open = slots.filter(slotOpen);

  // Keep choices consistent when the day or the party size changes.
  const slotValid = slot !== null && open.includes(slot);
  const table = tables.find((x) => x.id === tableId) ?? null;
  const tableValid = !!table && slotValid && inZone(table) && fits(table, party) && isFree(table.id, slot!, hold, taken);
  const chosenSlot = slotValid ? slot : null;
  const chosenTable = tableValid ? table : null;

  const stateOf = (x: PlanItem): TableState => {
    if (chosenTable?.id === x.id) return "selected";
    if (!inZone(x)) return "away";
    if (!fits(x, party)) return "unfit";
    if (chosenSlot === null) return "idle";
    return isFree(x.id, chosenSlot, hold, taken) ? "free" : "busy";
  };
  const describe = (x: PlanItem, s: TableState) =>
    `${b.tableName(x.label)}${x.zone ? `, ${b.zones[x.zone].toLowerCase()}` : ""}, ${b.upTo(x.seats_max)}, ${s === "selected" ? b.yours : s === "busy" ? b.busy : s === "unfit" ? b.unfit : s === "away" ? b.away : b.free}`;

  const dayLabel = (d: string) =>
    d === today ? b.today : d === shiftDate(today, 1) ? b.tomorrow : new Intl.DateTimeFormat(lang === "kk" ? "kk-KZ" : "ru-RU", { timeZone: "UTC", weekday: "short" }).format(new Date(d + "T12:00:00Z"));

  if (state.ok) {
    // The page's sticky «book» bar steps away once the booking is made (BookBar listens).
    if (typeof window !== "undefined") queueMicrotask(() => window.dispatchEvent(new Event("bolek:booked")));
    const v = state.values || {};
    // Everything the guest chose, so the confirmation can be checked at a glance
    // (user-testing-agent, 15 Nov 2026: no zone, no guests, «Стол 4» read as «на 4»).
    const d = v.date || date;
    const near = d === today || d === shiftDate(today, 1) ? `${dayLabel(d)}, ` : "";
    const when = `${near}${formatDay(d, lang)}, ${v.time}`;
    const z = isZone(v.zone) ? `, ${b.zones[v.zone].toLowerCase()}` : "";
    const seat = [v.party_size ? b.guestsN(Number(v.party_size)) : "", v.table ? `${b.tableName(v.table)}${z}` : ""].filter(Boolean).join(" · ");
    return (
      <div role="status" className="sheet-in flex flex-col items-start gap-3 py-2">
        <h3 className="text-[28px]">{b.successTitle}</h3>
        <p className="text-ink-2">
          {b.successText(when, seat)}
          {phrase ? ` ${b.phraseReminder(phrase)}` : ""}
        </p>
        <button type="button" onClick={onAgain} className="link-quiet text-[15px]">
          {t.invite.another}
        </button>
      </div>
    );
  }

  const fe = state.fieldErrors || {};
  const v = state.values || {};

  return (
    <form action={action} noValidate className="relative flex flex-col gap-7">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="venue_id" value={venueId} />
      {linkId ? <input type="hidden" name="link_id" value={linkId} /> : null}
      <input type="hidden" name="date" value={date} />
      <input type="hidden" name="party_size" value={party} />
      <input type="hidden" name="slot" value={chosenSlot ?? ""} />
      <input type="hidden" name="table_id" value={chosenTable?.id ?? ""} />
      <input type="hidden" name="zone" value={zone ?? ""} />
      <Honeypot />

      {/* Day and party size */}
      <fieldset className="flex min-w-0 flex-col gap-3">
        <legend className="label mb-3">{b.when}</legend>
        <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          {Array.from({ length: DAYS }, (_, i) => shiftDate(today, i)).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={d === date}
              onClick={() => setDate(d)}
              className="pick group flex min-w-[4.25rem] shrink-0 snap-start flex-col items-center rounded-[var(--radius-inner)] px-3 py-2.5 transition-colors duration-150"
            >
              <span className="text-[12px] font-semibold text-ink-3 first-letter:uppercase group-aria-pressed:text-canvas">{dayLabel(d)}</span>
              <span className="mt-0.5 font-display text-[20px] font-semibold leading-none tabular-nums">{Number(d.slice(8))}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between gap-4 rounded-[var(--radius-inner)] border border-line bg-raised px-4 py-2">
          <span className="text-[15px] text-ink">{b.guests}</span>
          <div className="flex items-center gap-3">
            <button type="button" aria-label={b.fewer} disabled={party <= 1} onClick={() => setParty((p) => Math.max(1, p - 1))} className="grid h-11 w-11 place-items-center bg-line text-[20px] leading-none text-ink disabled:opacity-30">
              −
            </button>
            <output aria-live="polite" className="w-6 text-center font-display text-[20px] font-semibold tabular-nums text-ink">
              {party}
            </output>
            <button type="button" aria-label={b.more} disabled={party >= 30} onClick={() => setParty((p) => Math.min(30, p + 1))} className="grid h-11 w-11 place-items-center bg-line text-[20px] leading-none text-ink disabled:opacity-30">
              +
            </button>
          </div>
        </div>
      </fieldset>

      {/* Where to sit: the plan's zones, before the time, since they change which times are free. */}
      {zonesHere.length ? (
        <fieldset id="book-where" className="min-w-0 scroll-mt-6">
          <legend className="label mb-3">{b.plan}</legend>
          <div className="flex flex-wrap gap-2">
            {[null, ...zonesHere.map((x) => x.z)].map((z) => (
              <button key={z ?? "any"} type="button" aria-pressed={zone === z} onClick={() => pickZone(z)} className="pick min-h-11 px-4 text-[14px] font-medium">
                {z ? b.zones[z] : b.anyZone}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      {/* Time */}
      <fieldset className="min-w-0">
        <legend className="label mb-3">{b.time}</legend>
        {loading ? (
          <p className="text-[14px] text-ink-3">{b.loading}</p>
        ) : open.length === 0 ? (
          <p className="text-[14px] text-ink-3">{zone ? b.noSlotsZone : b.noSlots}</p>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {slots
              .filter((m) => m >= (avail?.earliest ?? 0))
              .map((m) => {
                const ok = open.includes(m);
                const on = chosenSlot === m;
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={!ok}
                    aria-pressed={on}
                    onClick={() => setSlot(on ? null : m)}
                    className="pick min-h-11 text-[15px] font-medium tabular-nums transition-colors duration-150"
                  >
                    {clock(m)}
                  </button>
                );
              })}
          </div>
        )}
      </fieldset>

      {/* Table on the floor plan */}
      {plannedHalls.length ? (
        <fieldset className="min-w-0">
          <legend className="label mb-3">{zonesHere.length ? b.planTitle : b.plan}</legend>
          {plannedHalls.length > 1 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {plannedHalls.map((h) => (
                <button
                  key={h.id}
                  type="button"
                  aria-current={h.id === hallId ? "true" : undefined}
                  onClick={() => setHallId(h.id)}
                  className="chip"
                >
                  {(lang === "kk" && h.name_kk) || h.name}
                </button>
              ))}
            </div>
          ) : null}
          {plannedHalls
            .filter((h) => h.id === hallId)
            .map((h) => {
              // Wide enough that the smallest table is a 44px target; on a
              // phone the plan then scrolls sideways instead of shrinking.
              const smallest = Math.min(...items.filter((i) => i.hall_id === h.id && i.kind === "table").map((i) => Math.min(i.w, i.h)));
              const minWidth = Math.min(960, Math.ceil(((h.width + 4) * 44) / smallest));
              return (
                <div key={h.id}>
                  {/* Said before the plan, not after it (user-testing-agent, 15 Nov 2026). */}
                  {minWidth > 330 ? <p className="mb-2 text-[13px] text-ink-3 sm:hidden">{b.scrollHint}</p> : null}
                  {/* A region the keyboard can reach and scroll, even before a time makes the tables pickable. */}
                  <div ref={scroller} tabIndex={0} role="region" aria-label={`${b.plan}: ${(lang === "kk" && h.name_kk) || h.name}`} className="overflow-x-auto rounded-[var(--radius-inner)] border border-line bg-canvas p-2 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]">
                    <div style={{ minWidth }}>
                      <FloorPlan hall={h} items={items} stateOf={stateOf} describe={describe} onSelect={chosenSlot === null ? undefined : (x) => setTableId(chosenTable?.id === x.id ? null : x.id)} />
                    </div>
                  </div>
                  {chosenSlot !== null ? (
                    <div className="mt-4">
                      <p className="label mb-2">{b.tables}</p>
                      <div className="flex flex-wrap gap-2">
                        {items
                          .filter((x) => x.hall_id === h.id && x.kind === "table" && inZone(x) && fits(x, party))
                          .map((x) => {
                            const s = stateOf(x);
                            return (
                              <button
                                key={x.id}
                                type="button"
                                disabled={s === "busy"}
                                aria-pressed={s === "selected"}
                                onClick={() => setTableId(s === "selected" ? null : x.id)}
                                className="pick min-h-11 px-4 text-[14px] font-medium"
                              >
                                {b.tableName(x.label)} · {b.upTo(x.seats_max)}
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          <p className="mt-3 text-[14px] text-ink-3" aria-live="polite">
            {chosenSlot === null
              ? b.pickTimeFirst
              : chosenTable
                ? `${b.yours}: ${b.tableName(chosenTable.label)}, ${b.upTo(chosenTable.seats_max)}`
                : b.planHint}
          </p>
        </fieldset>
      ) : null}

      {/* Contacts */}
      <fieldset className="flex min-w-0 flex-col gap-5">
        <legend className="label mb-3">{b.contacts}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label={t.invite.guestName} htmlFor="b-name" error={fe.guest_name}>
            <input id="b-name" name="guest_name" className="field" autoComplete="given-name" required defaultValue={v.guest_name} {...errProps("b-name", fe.guest_name)} />
          </Field>
          <Field label={t.invite.phone} htmlFor="b-phone" error={fe.phone}>
            <input id="b-phone" name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" required defaultValue={v.phone} {...errProps("b-phone", fe.phone)} />
          </Field>
        </div>
        <Field label={t.invite.comment} htmlFor="b-comment" optional={t.optional}>
          <textarea id="b-comment" name="comment" rows={2} className="field" defaultValue={v.comment} />
        </Field>
        <Consent id="b-consent" label={t.invite.consent} linkLabel={t.more} error={fe.consent} defaultChecked={v.consent === "1"} />
      </fieldset>

      {/* What will be booked, next to the button, so no one scrolls back up to check. */}
      {chosenSlot !== null ? (
        <p className="-mb-3 text-[15px] text-ink-2" aria-live="polite">
          <span className="label mr-2">{b.summary}</span>
          {[(() => {
            // A slot after midnight belongs to the next calendar day: say that day.
            const cal = toCalendar(date, chosenSlot).date;
            return `${cal === today || cal === shiftDate(today, 1) ? `${dayLabel(cal)}, ` : ""}${formatDay(cal, lang)}`;
          })(), clock(chosenSlot), b.guestsN(party), zone ? b.zones[zone] : null, chosenTable ? b.tableName(chosenTable.label) : null].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      <FormError error={state.error && !Object.keys(fe).length ? state.error : undefined} />
      <SubmitButton className="btn btn-primary w-full sm:w-auto" disabled={chosenSlot === null}>
        {chosenSlot === null ? b.chooseTime : b.submit(clock(chosenSlot))}
      </SubmitButton>
    </form>
  );
}
