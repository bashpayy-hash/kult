import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Orb } from "@/components/Orb";
import { OrbRoad } from "@/components/OrbRoad";
import { MemberApplicationForm, PartnerApplicationForm } from "./_landing/ApplicationForms";

export default async function Landing() {
  const { lang, t } = await getDict();
  const L = t.landing;
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* One block, one action: the headline and «Подать заявку». */}
        <section className="px-edge grid items-center gap-12 pb-20 pt-10 md:grid-cols-[1.15fr_0.85fr] md:pb-28 md:pt-16">
          <div>
            <h1 className="rise text-[44px] sm:text-[56px] md:text-[64px] lg:text-[76px]">{L.title}</h1>
            <p className="rise rise-2 mt-6 max-w-[34rem] text-[17px] text-ink-2 md:text-[18px]">{L.lead}</p>
            <div className="rise rise-3 mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
              <a href="#join" className="btn btn-primary">
                {L.cta}
              </a>
              <a href="#partners" className="link-quiet text-[15px]">
                {L.partnerLink}
              </a>
            </div>
          </div>
          <div aria-hidden="true" className="rise rise-1 relative mx-auto h-[260px] w-[260px] md:h-[400px] md:w-[400px]">
            <Orb tone="iris" size="72%" className="absolute left-0 top-0" />
            <Orb tone="coral" size="38%" className="absolute bottom-[4%] right-[2%]" />
            <Orb tone="aqua" size="17%" className="absolute right-[14%] top-[6%]" />
          </div>
        </section>

        <section className="px-edge py-16 md:py-24" aria-labelledby="how">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 id="how" className="reveal text-[36px] md:text-[48px]">
              {L.howTitle}
            </h2>
            <div className="max-w-[44rem]">
              <OrbRoad steps={L.steps} />
            </div>
          </div>
        </section>

        <section id="join" className="px-edge scroll-mt-6 py-12 md:py-20" aria-labelledby="join-title">
          <div className="rounded-tile-r bg-tile p-6 sm:p-8 md:p-12">
            <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:gap-12">
              <div>
                <h2 id="join-title" className="text-[36px] md:text-[48px]">
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
                <h2 id="partners-title" className="text-[36px] md:text-[48px]">
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
