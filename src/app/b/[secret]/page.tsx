import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDict } from "@/lib/i18n";
import { loadDashboard, recommenderBySecret } from "@/lib/blat";
import { rememberHere } from "@/app/blatActions";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { BlatDashboard } from "@/components/BlatDashboard";
import { BlatIntro } from "@/components/BlatIntro";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Блат", robots: { index: false, follow: false }, referrer: "no-referrer" };

/** The recommender's private link, for another phone: the same page, keyed by the secret. */
export default async function BlatPrivatePage({ params }: { params: Promise<{ secret: string }> }) {
  const rec = await recommenderBySecret((await params).secret);
  if (!rec) notFound();
  const { lang, t } = await getDict();
  const d = await loadDashboard(rec.id);
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main className="px-edge pb-8 pt-2">
        <BlatIntro t={t} short />
        <form action={rememberHere} className="mt-6">
          <input type="hidden" name="secret" value={rec.secret} />
          <button type="submit" className="btn btn-soft btn-sm">{t.blat.rememberHere}</button>
        </form>
        <div className="mt-10 max-w-[56rem]">
          <BlatDashboard d={d} lang={lang} t={t} secret={rec.secret} />
        </div>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
