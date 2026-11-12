import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isUuid } from "@/lib/forms";
import { almatyToday, earliestStart, isIsoDate, shiftDate } from "@/lib/format";
import { LEAD_MINUTES } from "@/lib/booking";
import { loadTaken } from "@/lib/venueData";

export const dynamic = "force-dynamic";

// Public: which tables are held when, for one venue and service day. Only
// table ids and minutes — no names or phones.
export async function GET(req: NextRequest) {
  const venue = req.nextUrl.searchParams.get("venue") || "";
  const date = req.nextUrl.searchParams.get("date") || "";
  const today = almatyToday();
  if (!isUuid(venue) || !isIsoDate(date) || date < today || date > shiftDate(today, 90)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  const [v] = await db()`select 1 from venues where id = ${venue} and status = 'active'`;
  if (!v) return NextResponse.json({ error: "not found" }, { status: 404 });
  const taken = await loadTaken(venue, date);
  return NextResponse.json(
    { taken, earliest: earliestStart(date, LEAD_MINUTES) },
    { headers: { "cache-control": "no-store" } },
  );
}
