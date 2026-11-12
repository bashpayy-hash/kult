import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { CLUB_COVER } from "@/lib/covers";
import { Plate } from "@/components/Plate";
import { MemberApplicationForm, PartnerApplicationForm } from "../_landing/ApplicationForms";

export const metadata: Metadata = { title: "Клуб" };

/** The club: how it works and the two applications (moved here from «/»). */
export default async function Join() {
  const { lang, t } = await getDict();
  const L = t.landing;
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* Paper cover: the envelope whose flap is a mountain (шақыру). */}
        <section className="bg-paper text-paper-ink" aria-labelledby="join-h1">
          <div className="px-edge grid items-center gap-8 py-10 md:grid-cols-2 md:gap-12 md:py-16">
            <div className="max-w-[34rem]">
              <h1 id="join-h1" className="text-[40px] text-paper-ink md:text-[56px]">
                {t.catalog.joinTitle}
              </h1>
              <p className="mt-4 text-[17px] text-paper-ink-2 md:text-[18px]">{L.lead}</p>
              <h2 id="how" className="mt-8 text-[20px] text-paper-ink">
                {L.howTitle}
              </h2>
              <p className="mt-2 text-[16px] text-paper-ink-2">{L.example}</p>
            </div>
            <div className="max-w-[24rem] md:justify-self-end">
              <Plate src={CLUB_COVER.src} srcSet={CLUB_COVER.srcSet} sizes="(min-width: 768px) 32vw, 90vw" bg={CLUB_COVER.bg} priority />
            </div>
          </div>
        </section>

        <section id="join" className="px-edge scroll-mt-6 py-12 md:py-20" aria-labelledby="join-title">
          <div className="border-t border-line pt-10">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
              <div>
                <h2 id="join-title" className="text-[30px] md:text-[40px]">
                  {L.member.title}
                </h2>
                <p className="mt-4 max-w-[36rem] text-ink-2">{L.member.lead}</p>
              </div>
              <div>
                <MemberApplicationForm lang={lang} />
              </div>
            </div>
          </div>
        </section>

        <section id="partners" className="px-edge scroll-mt-6 py-12 md:py-20" aria-labelledby="partners-title">
          <div className="border-t border-line pt-10">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
              <div>
                <h2 id="partners-title" className="text-[30px] md:text-[40px]">
                  {L.partner.title}
                </h2>
                <p className="mt-4 max-w-[36rem] text-ink-2">{L.partner.lead}</p>
              </div>
              <div>
                <PartnerApplicationForm lang={lang} />
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter t={t} />
    </>
  );
}
