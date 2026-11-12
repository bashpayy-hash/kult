// Booking rules shared by the browser (to draw slots and tables) and the
// server (to check them again before inserting). Times are minutes from the
// start of the *service day* — the date the guest picked. A bar open
// 17:00–02:00 has slots up to 25:00 = 01:00 of the next calendar day.

export type PlanHall = { id: string; name: string; name_kk: string | null; width: number; height: number };

export type PlanItem = {
  id: string;
  hall_id: string;
  kind: "table" | "decor";
  label: string;
  shape: "rect" | "round";
  x: number;
  y: number;
  w: number;
  h: number;
  seats_min: number;
  seats_max: number;
};

/** A live booking on a table, as an interval of service-day minutes. */
export type Taken = { table_id: string; from: number; to: number };

export type VenueHours = { open_time: string; close_time: string; slot_minutes: number; hold_minutes: number };

/** Guests can still be seated this many minutes before closing. */
export const LAST_SEATING_BEFORE_CLOSE = 60;
/** Same-day bookings start at least this far from now. */
export const LEAD_MINUTES = 30;

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** 1170 → "19:30"; 1530 → "01:30" (next day). */
export function clock(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Service-day minutes of every bookable slot. */
export function slotList(h: Pick<VenueHours, "open_time" | "close_time" | "slot_minutes">): number[] {
  const open = toMinutes(h.open_time);
  let close = toMinutes(h.close_time);
  if (close <= open) close += 1440; // closes after midnight
  const last = Math.max(open, close - LAST_SEATING_BEFORE_CLOSE);
  const out: number[] = [];
  for (let m = open; m <= last; m += h.slot_minutes) out.push(m);
  return out;
}

export function fits(t: PlanItem, party: number): boolean {
  return t.kind === "table" && party >= t.seats_min && party <= t.seats_max;
}

export function isFree(tableId: string, start: number, hold: number, taken: Taken[]): boolean {
  const end = start + hold;
  return !taken.some((x) => x.table_id === tableId && x.from < end && start < x.to);
}

/** The smallest free table that seats the party, or null. */
export function pickTable(items: PlanItem[], party: number, start: number, hold: number, taken: Taken[]): PlanItem | null {
  const ok = items
    .filter((t) => fits(t, party) && isFree(t.id, start, hold, taken))
    .sort((a, b) => a.seats_max - b.seats_max || a.label.localeCompare(b.label, "ru", { numeric: true }));
  return ok[0] ?? null;
}

/** Calendar date and wall-clock time of a service-day minute. */
export function toCalendar(serviceDate: string, min: number): { date: string; time: string } {
  const d = new Date(serviceDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + Math.floor(min / 1440));
  return { date: d.toISOString().slice(0, 10), time: clock(min) };
}
