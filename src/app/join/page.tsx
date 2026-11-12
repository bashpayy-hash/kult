import type { Metadata } from "next";
import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
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
        <section className="px-edge pt-8 md:pt-12" aria-labelledby="join-h1">
          <h1 id="join-h1" className="text-[38px] md:text-[48px]">
            {t.catalog.joinTitle}
          </h1>
          <p className="mt-4 max-w-[40rem] text-[17px] text-ink-2">{L.lead}</p>
        </section>

        {/* One concrete example instead of the four orb steps (12 Nov 2026). */}
        <section className="px-edge pb-8 pt-12 md:pb-12 md:pt-16" aria-labelledby="how">
          <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
            <h2 id="how" className="text-[24px] md:text-[28px]">
              {L.howTitle}
            </h2>
            <p className="max-w-[44rem] text-[17px] text-ink-2 md:text-[18px]">{L.example}</p>
          </div>
        </section>

        <section id="join" className="px-edge scroll-mt-6 py-12 md:py-20" aria-labelledby="join-title">
          <div className="rounded-tile-r bg-tile p-6 sm:p-8 md:p-12">
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
          <div className="rounded-tile-r bg-tile p-6 sm:p-8 md:p-12">
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
