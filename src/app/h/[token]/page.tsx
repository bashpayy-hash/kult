import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { getDict } from "@/lib/i18n";
import { almatyToday, formatDay, formatMoney, isIsoDate, shiftDate } from "@/lib/format";
import { Mark } from "@/components/Logo";
import { LangSwitch } from "@/components/LangSwitch";
import { Orb } from "@/components/Orb";
import { BookingCard, LogEntry, MemberVisitPanel, PhraseGuestPanel, type HostBooking, type HostLink } from "./HostClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Хостес", robots: { index: false, follow: false } };

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ d?: string }> };

const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;

export default async function HostPage({ params, searchParams }: Props) {
  const { token } = await params;
  const { d } = await searchParams;
  const { lang, t } = await getDict();
  const sql = db();

  const [venue] = TOKEN_RE.test(token)
    ? await sql<{ id: string; name: string }[]>`select id, name from venues where host_token = ${token} and status <> 'archived'`
    : [];

  if (!venue) {
    return (
      <main className="px-edge flex min-h-dvh flex-col items-start justify-center gap-5">
        <Orb tone="pearl" size={64} />
        <h1 className="text-[34px]">{t.host.badTitle}</h1>
        <p className="text-ink-2">{t.host.badText}</p>
      </main>
    );
  }

  const today = almatyToday();
  const date = isIsoDate(d) && d >= shiftDate(today, -7) && d <= shiftDate(today, 7) ? d : today;

  const [bookings, links, phraseGuests, memberVisits] = await Promise.all([
    sql<HostBooking[]>`
      select b.id, b.guest_name, b.phone, b.booking_time, b.party_size, b.comment, b.status,
             m.name as member_name, m.slug as member_slug,
             gv.guests_count, gv.check_amount
      from guest_bookings b
      join tracking_links tl on tl.id = b.tracking_link_id
      join members m on m.id = tl.member_id
      left join guest_visits gv on gv.booking_id = b.id
      where tl.venue_id = ${venue.id} and b.booking_date = ${date} and b.status <> 'cancelled'
      order by b.booking_time, b.created_at`,
    sql<HostLink[]>`
      select tl.id, m.name as member_name, m.slug as member_slug, o.member_reward
      from tracking_links tl
      join members m on m.id = tl.member_id
      left join offers o on o.id = tl.offer_id
      where tl.venue_id = ${venue.id} and tl.active and m.status = 'active'
      order by m.name`,
    sql<{ id: string; member_name: string; member_slug: string; guests_count: number; check_amount: number }[]>`
      select gv.id, m.name as member_name, m.slug as member_slug, gv.guests_count, gv.check_amount
      from guest_visits gv
      join tracking_links tl on tl.id = gv.tracking_link_id
      join members m on m.id = tl.member_id
      where tl.venue_id = ${venue.id} and gv.source = 'phrase' and gv.visit_date = ${date}
      order by gv.created_at`,
    sql<{ id: string; member_name: string; member_slug: string; received: string | null; locked: boolean; source: string }[]>`
      select mv.id, m.name as member_name, m.slug as member_slug, mv.received, mv.source,
             exists (select 1 from content_proofs cp where cp.member_visit_id = mv.id) as locked
      from member_visits mv
      join tracking_links tl on tl.id = mv.tracking_link_id
      join members m on m.id = tl.member_id
      where tl.venue_id = ${venue.id} and mv.visit_date = ${date}
      order by mv.created_at`,
  ]);

  const arrived = bookings.filter((b) => b.status === "arrived");
  const guests = arrived.reduce((s, b) => s + (b.guests_count || 0), 0) + phraseGuests.reduce((s, g) => s + g.guests_count, 0);
  const revenue = arrived.reduce((s, b) => s + (b.check_amount || 0), 0) + phraseGuests.reduce((s, g) => s + g.check_amount, 0);

  const days = [
    { d: shiftDate(today, -1), label: t.host.yesterday },
    { d: today, label: t.host.today },
    { d: shiftDate(today, 1), label: t.host.tomorrow },
  ];

  return (
    <main className="px-edge pb-16">
      <header className="flex h-16 items-center justify-between md:h-20">
        <span className="inline-flex items-center gap-2.5 text-[13px] font-semibold text-ink-3">
          <Mark size={20} />
          {t.host.title}
        </span>
        <LangSwitch lang={lang} label={t.langLabel} />
      </header>

      <div className="max-w-[40rem]">
        <h1 className="text-[34px] md:text-[40px]">{venue.name}</h1>
        <p className="mt-2 text-[15px] text-ink-3 first-letter:uppercase">{formatDay(date, lang, true)}</p>

        <nav aria-label="День" className="mt-6 flex gap-2">
          {days.map((x) => (
            <Link
              key={x.d}
              href={x.d === today ? `/h/${token}` : `/h/${token}?d=${x.d}`}
              aria-current={x.d === date ? "date" : undefined}
              className={`btn btn-sm ${x.d === date ? "bg-ink text-canvas" : "btn-soft"}`}
            >
              {x.label}
            </Link>
          ))}
        </nav>

        <p className="mt-6 text-[15px] text-ink-2">
          {[
            `${t.host.bookings}: ${bookings.length}`,
            `${t.host.status.arrived}: ${arrived.length}`,
            t.host.guests(guests),
            formatMoney(revenue),
          ].join(" · ")}
        </p>

        <section aria-labelledby="bookings" className="mt-8">
          <h2 id="bookings" className="text-[24px]">
            {t.host.bookings}
          </h2>
          {bookings.length === 0 ? (
            <p className="mt-3 text-ink-3">{t.host.noBookings}</p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {bookings.map((b) => (
                <li key={b.id}>
                  <BookingCard b={b} token={token} lang={lang} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-10 flex flex-col gap-3" aria-label={t.host.phraseGuest}>
          {links.length === 0 ? (
            <p className="text-ink-3">{t.host.noMembers}</p>
          ) : (
            <>
              <PhraseGuestPanel links={links} token={token} date={date} lang={lang} />
              <MemberVisitPanel links={links} token={token} date={date} lang={lang} />
            </>
          )}
        </section>

        <section aria-labelledby="log" className="mt-10">
          <h2 id="log" className="text-[24px]">
            {t.host.logTitle}
          </h2>
          {phraseGuests.length + memberVisits.length === 0 ? (
            <p className="mt-3 text-ink-3">{t.host.logEmpty}</p>
          ) : (
            <ul className="mt-4 flex flex-col divide-y divide-line rounded-tile-r bg-tile px-5">
              {phraseGuests.map((g) => (
                <LogEntry
                  key={g.id}
                  token={token}
                  lang={lang}
                  kind="guest"
                  id={g.id}
                  slug={g.member_slug}
                  title={t.host.logPhrase(g.member_name)}
                  meta={`${t.host.guests(g.guests_count)} · ${formatMoney(g.check_amount)}`}
                />
              ))}
              {memberVisits.map((m) => (
                <LogEntry
                  key={m.id}
                  token={token}
                  lang={lang}
                  kind="member"
                  id={m.id}
                  slug={m.member_slug}
                  title={t.host.logMember(m.member_name)}
                  meta={m.received || ""}
                  removable={m.source === "host" && !m.locked}
                />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
