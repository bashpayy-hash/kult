import Link from "next/link";
import { Logo, Mark } from "./Logo";
import { LangSwitch } from "./LangSwitch";
import type { Dict, Lang } from "@/lib/i18n/dicts";

export function SiteHeader({ lang, t, logoHref = "/" }: { lang: Lang; t: Dict; logoHref?: string }) {
  return (
    <header className="px-edge flex h-16 items-center justify-between md:h-20">
      <Logo href={logoHref} />
      <LangSwitch lang={lang} label={t.langLabel} />
    </header>
  );
}

export function SiteFooter({ t }: { t: Dict }) {
  return (
    <footer className="px-edge mt-24 border-t border-line py-10 text-[14px] text-ink-3 md:mt-32">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="inline-flex items-center gap-2.5 text-ink-2" aria-label="Kult">
          <Mark size={18} />
          <span>{t.brandLine}</span>
        </Link>
        <Link href="/privacy" className="link-quiet">
          {t.privacyLink}
        </Link>
      </div>
    </footer>
  );
}
