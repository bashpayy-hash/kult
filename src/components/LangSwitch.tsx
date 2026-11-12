import { setLang } from "@/app/actions";
import type { Lang } from "@/lib/i18n/dicts";

/**
 * One 44px button naming the other language (12 Nov 2026: the two 32px
 * pills were below the touch-target minimum and crowded the phone header).
 */
export function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  const other: Lang = lang === "ru" ? "kk" : "ru";
  return (
    <form action={setLang}>
      <button
        type="submit"
        name="lang"
        value={other}
        lang={other}
        aria-label={`${label}: ${other === "kk" ? "Қазақша" : "Русский"}`}
        className="grid h-11 min-w-11 place-items-center rounded-full border border-line px-3 font-[family-name:var(--font-ui)] text-[14px] font-semibold text-ink-2 transition-colors duration-150 hover:border-ink-4 hover:text-ink"
      >
        {other === "kk" ? "Қаз" : "Рус"}
      </button>
    </form>
  );
}
