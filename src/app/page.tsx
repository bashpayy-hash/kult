import { getDict } from "@/lib/i18n";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { OrbRoad } from "@/components/OrbRoad";
import { MemberApplicationForm, PartnerApplicationForm } from "./_landing/ApplicationForms";

export default async function Landing() {
  const { lang, t } = await getDict();
  const L = t.landing;
  return (
    <>
      <SiteHeader lang={lang} t={t} />
      <main>
        {/* The composition of the owner's iitaly.net (12 Nov 2026): a full-bleed
            scene with the headline card over its calm right half; on a phone the
            scene sits on top and the text follows. One block, one action. */}
        <section className="relative">
          <div className="relative h-[62vw] max-h-[520px] min-h-[240px] overflow-hidden bg-tile lg:h-[min(calc(100dvh-80px),760px)] lg:max-h-none lg:min-h-[600px]">
            <img
              src="/illustrations/scenes/hero-1600.webp"
              srcSet="/illustrations/scenes/hero-640.webp 640w, /illustrations/scenes/hero-1024.webp 1024w, /illustrations/scenes/hero-1600.webp 1600w, /illustrations/scenes/hero-2400.webp 2400w"
              sizes="100vw"
              alt={L.heroAlt}
              fetchPriority="high"
              className="absolute inset-0 h-full w-full object-cover object-[28%_60%]"
            />
          </div>
          <div className="px-edge lg:pointer-events-none lg:absolute lg:inset-0 lg:flex lg:items-center lg:justify-end">
            <div className="rise pt-9 lg:pointer-events-auto lg:max-w-[29rem] lg:rounded-tile lg:bg-canvas/88 lg:p-10 lg:shadow-[0_24px_60px_rgb(0_0_0/0.45)]">
              <h1 className="text-[38px] sm:text-[44px] lg:text-[48px]">
                {L.title} <span className="block text-accent">{L.titleAccent}</span>
              </h1>
              <p className="mt-5 max-w-[34rem] text-[17px] text-ink-2">{L.lead}</p>
              <div className="mt-8 flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-6">
                <a href="#join" className="btn btn-primary w-full sm:w-auto">
                  {L.cta}
                </a>
                <a href="#partners" className="link-quiet text-[15px]">
                  {L.partnerLink}
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="px-edge pb-16 pt-24 md:pb-24 md:pt-32" aria-labelledby="how">
          <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <h2 id="how" className="reveal text-[30px] md:text-[40px]">
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
