import Link from "next/link";
import { Logo, Mark } from "./Logo";
import { LangSwitch } from "./LangSwitch";
import type { Dict, Lang } from "@/lib/i18n/dicts";

export function SiteHeader({ lang, t, logoHref = "/" }: { lang: Lang; t: Dict; logoHref?: string }) {
  return (
    <header className="px-edge flex h-16 items-center justify-between gap-4 md:h-20">
      <Logo href={logoHref} />
      <div className="flex items-center gap-5">
        <nav aria-label="Shaqyru" className="hidden items-center gap-5 font-[family-name:var(--font-ui)] text-[15px] sm:flex">
          <Link href="/places" className="text-ink-2 transition-colors duration-150 hover:text-ink">
            {t.nav.places}
          </Link>
          <Link href="/join" className="text-ink-2 transition-colors duration-150 hover:text-ink">
            {t.nav.club}
          </Link>
        </nav>
        <LangSwitch lang={lang} label={t.langLabel} />
      </div>
    </header>
  );
}

export function SiteFooter({ t }: { t: Dict }) {
  return (
    <footer className="px-edge mt-24 border-t border-line py-10 text-[14px] text-ink-3 md:mt-32">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink-2" aria-label="Shaqyru">
          <Mark size={18} />
          <span>{t.brandLine}</span>
        </Link>
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          <Link href="/places" className="link-quiet">
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
