import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { almatyToday } from "@/lib/format";
import { pilotThreshold } from "@/lib/env";
import type { PairStats } from "@/lib/types";

export const dynamic = "force-dynamic";

// Semicolon-separated UTF-8 with BOM: opens correctly in Excel with a Russian
// locale (comma CSV lands in one column there) and in Google Sheets.
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const num = (v: number | null) => (v == null ? "" : String(v).replace(".", ","));

export async function GET() {
  if (!(await isAdmin())) return new NextResponse("Unauthorized", { status: 401 });
  const threshold = pilotThreshold();
  const rows = await db()<PairStats[]>`select * from pair_stats order by member_name, venue_name`;
  const head = [
    "Участница", "Instagram", "Заведение", "Ссылка активна", "Визиты участницы", "Просмотры", "Клики", "Уникальные клики",
    "Брони", "Гости", "Гости по брони", "Гости по фразе", "Выручка, ₸", "Гостей на визит", "Конверсия просмотров в гостей, %",
    `Порог ${threshold} пройден`,
  ];
  const lines = rows.map((r) =>
    [
      r.member_name, r.member_instagram ? `@${r.member_instagram}` : "", r.venue_name, r.active ? "да" : "нет",
      r.member_visits, r.views, r.clicks, r.unique_clicks, r.bookings, r.guests, r.guests_booking, r.guests_phrase,
      r.revenue, num(r.guests_per_visit), num(r.view_to_guest_pct),
      r.member_visits > 0 && (r.guests_per_visit ?? 0) >= threshold ? "да" : "нет",
    ].map(cell).join(";"),
  );
  const body = "﻿" + [head.map(cell).join(";"), ...lines].join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kult-pilot-${almatyToday()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
