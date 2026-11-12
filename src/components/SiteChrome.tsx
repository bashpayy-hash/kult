import Link from "next/link";
import { Logo, Mark } from "./Logo";
import { LangSwitch } from "./LangSwitch";
import type { Dict, Lang } from "@/lib/i18n/dicts";

export function SiteHeader({ lang, t, logoHref = "/" }: { lang: Lang; t: Dict; logoHref?: string }) {
  return (
    <header className="px-edge flex h-16 items-center justify-between gap-4 md:h-20">
      <Logo href={logoHref} />
      <div className="flex items-center gap-1 sm:gap-3">
        {/* Visible on phones too: with two sections a header beats a tab bar. */}
        <nav aria-label="Бөлек" className="flex items-center font-[family-name:var(--font-ui)] text-[15px]">
          <Link href="/" className="grid h-11 place-items-center px-2.5 text-ink-2 transition-colors duration-150 hover:text-ink">
            {t.nav.places}
          </Link>
          <Link href="/join" className="grid h-11 place-items-center px-2.5 text-ink-2 transition-colors duration-150 hover:text-ink">
            {t.nav.club}
          </Link>
        </nav>
        <LangSwitch lang={lang} label={t.langLabel} />
      </div>
    </header>
  );
}

export function SiteFooter({ t, flush = false }: { t: Dict; flush?: boolean }) {
  return (
    // `flush`: the page ends on a paper band, so no dark gap before the footer.
    <footer className={`px-edge border-t border-line py-10 text-[14px] text-ink-3 ${flush ? "mt-0 border-t-0" : "mt-24 md:mt-32"}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2.5 text-ink-2" aria-label="Бөлек">
          <Mark size={18} />
          <span>{t.brandLine}</span>
        </Link>
        <div className="flex flex-wrap gap-x-6 [&>a]:inline-flex [&>a]:min-h-11 [&>a]:items-center">
          <Link href="/" className="link-quiet">
            {t.nav.places}
          </Link>
          <Link href="/join" className="link-quiet">
            {t.nav.club}
          </Link>
          <Link href="/privacy" className="link-quiet">
            {t.privacyLink}
          </Link>
        </div>
      </div>
    </footer>
  );
}
