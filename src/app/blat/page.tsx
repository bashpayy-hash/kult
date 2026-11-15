import type { Metadata } from "next";
import Link from "next/link";
import { getDict } from "@/lib/i18n";
import { currentRecommender, loadDashboard, rewardsList } from "@/lib/blat";
import { siteUrl } from "@/lib/env";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BlatDashboard } from "@/components/BlatDashboard";
import { BlatIntro } from "@/components/BlatIntro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Блат" };

/** What blat is; for a browser that already recommends, its balance, picks and treats. */
export default async function BlatPage() {
  const { lang, t } = await getDict();
  const B = t.blat;
  const rec = await currentRecommender();
  const d = rec ? await loadDashboard(rec.id) : null;
  const rewards = d ? [] : await rewardsList();
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <BlatIntro t={t} short={!!d} />
        <div className="mt-10 max-w-[56rem]">
          {d && rec ? (
            <>
              <BlatDashboard d={d} lang={lang} t={t} />
              <details className="mt-12 border-t border-line pt-5 text-[15px]">
                <summary className="cursor-pointer text-ink-2">{B.privateLink}</summary>
                <p className="mt-3 break-all rounded-[var(--radius-inner)] bg-raised px-4 py-3 font-mono text-[14px] text-ink">{`${siteUrl()}/b/${rec.secret}`}</p>
                <p className="mt-2 text-[13px] text-ink-3">{B.privateHint}</p>
              </details>
            </>
          ) : (
            <>
              <Link href="/#places" className="btn btn-primary">{B.start}</Link>
              {rewards.length ? (
                <section aria-labelledby="blat-rewards" className="mt-12">
                  <h2 id="blat-rewards" className="text-[24px]">{B.rewardsTitle}</h2>
                  <ul className="mt-4 flex flex-col divide-y divide-line border-y border-line">
                    {rewards.map((w) => (
                      <li key={w.id} className="flex items-baseline justify-between gap-4 py-4">
                        <span className="text-[16px] text-ink">
                          {(lang === "kk" && w.title_kk) || w.title}
                          <span className="block text-[14px] text-ink-3">
                            <Link href={`/v/${w.venue_slug}`} className="link-quiet">{w.venue_name}</Link>
                          </span>
                        </span>
                        <span className="num shrink-0 text-[15px] text-ink-2">{B.points(w.cost)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
