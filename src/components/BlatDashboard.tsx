import Link from "next/link";
import { CancelCode, RedeemButton, ShareLink } from "@/components/Blat";
import type { Dashboard } from "@/lib/blat";
import { siteUrl } from "@/lib/env";
import { formatDay } from "@/lib/format";
import type { Dict, Lang } from "@/lib/i18n/dicts";

/** A recommender's own page: balance, codes to show, picks with what they brought, treats, history. */
export function BlatDashboard({ d, lang, t, secret }: { d: Dashboard; lang: Lang; t: Dict; secret?: string }) {
  const B = t.blat;
  const base = siteUrl();
  const issued = d.codes.filter((c) => c.status === "issued");
  return (
    <div className="flex flex-col gap-12">
      <section aria-labelledby="blat-balance" className="flex flex-wrap items-end justify-between gap-6 border-y border-line py-6">
        <div>
          <p id="blat-balance" className="label">{B.balance}</p>
          <p className="numerals mt-2 text-[72px] leading-none text-ink md:text-[96px]">{d.balance}</p>
        </div>
        <p className="max-w-[24rem] text-[15px] text-ink-2">{B.lead}</p>
      </section>

      {issued.length ? (
        <section aria-labelledby="blat-codes">
          <h2 id="blat-codes" className="text-[24px]">{B.codesTitle}</h2>
          <p className="mt-1 text-[15px] text-ink-2">{B.codeHint}</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {issued.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 bg-paper px-5 py-4 text-paper-ink">
                <p className="text-[13px] font-semibold text-paper-ink-2">{c.venue_name}</p>
                <p className="font-mono text-[34px] font-semibold tracking-[0.12em]">{c.code.slice(0, 3)} {c.code.slice(3)}</p>
                <p className="text-[15px]">{(lang === "kk" && c.title_kk) || c.title}</p>
                <div className="[&_button]:text-paper-ink-2">
                  <CancelCode id={c.id} secret={secret} label={B.cancel} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="blat-picks">
        <h2 id="blat-picks" className="text-[24px]">{B.picksTitle}</h2>
        {d.picks.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-2">
            {B.noPicks}{" "}
            <Link href="/#places" className="link-quiet">{B.start} →</Link>
          </p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
            {d.picks.map((p) => (
              <li key={p.id} className="flex flex-col gap-3 py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <Link href={`/p/${p.code}`} className="text-[19px] font-semibold text-ink hover:text-accent">{p.venue_name}</Link>
                  <span className="text-[14px] text-ink-3">{B.stats(p.opens, p.bookings, p.guests)} · {B.points(p.points)}</span>
                </div>
                {p.note ? <p className="text-[15px] text-ink-2">«{p.note}»</p> : null}
                <ShareLink url={`${base}/p/${p.code}`} text={B.shareText(p.venue_name)} lang={lang} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="blat-rewards">
        <h2 id="blat-rewards" className="text-[24px]">{B.rewardsTitle}</h2>
        {d.rewards.length === 0 ? (
          <p className="mt-3 text-[15px] text-ink-2">{B.noRewards}</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
            {d.rewards.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="text-[16px] font-medium text-ink">{(lang === "kk" && w.title_kk) || w.title}</p>
                  <p className="text-[14px] text-ink-3">
                    <Link href={`/v/${w.venue_slug}`} className="link-quiet">{w.venue_name}</Link> · {B.points(w.cost)}
                  </p>
                </div>
                <RedeemButton rewardId={w.id} lang={lang} secret={secret} disabled={d.balance < w.cost} label={d.balance < w.cost ? B.needMore(w.cost - d.balance) : B.take} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {d.history.length ? (
        <section aria-labelledby="blat-history">
          <h2 id="blat-history" className="text-[24px]">{B.historyTitle}</h2>
          <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line text-[15px]">
            {d.history.map((h, i) => (
              <li key={i} className="flex items-baseline justify-between gap-4 py-3">
                <span className="text-ink-2">
                  {B.reason[h.reason]}
                  {h.venue_name ? ` · ${h.venue_name}` : ""} · {formatDay(h.created_at.slice(0, 10), lang)}
                </span>
                <span className={`num shrink-0 font-semibold ${h.delta > 0 ? "text-success" : "text-ink-3"}`}>{h.delta > 0 ? `+${h.delta}` : h.delta}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

    </div>
  );
}
