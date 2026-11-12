import { setLang } from "@/app/actions";
import type { Lang } from "@/lib/i18n/dicts";

/** Two quiet pills. Saves the choice in a cookie; the page re-renders in place. */
export function LangSwitch({ lang, label }: { lang: Lang; label: string }) {
  const opts: { value: Lang; text: string }[] = [
    { value: "ru", text: "Рус" },
    { value: "kk", text: "Қаз" },
  ];
  return (
    <form action={setLang} aria-label={label} className="flex items-center rounded-full border border-line p-1">
      {opts.map((o) => (
        <button
          key={o.value}
          type="submit"
          name="lang"
          value={o.value}
          aria-pressed={lang === o.value}
          className={`min-h-8 rounded-full px-3 text-[13px] font-semibold transition-colors duration-150 ${
            lang === o.value ? "bg-raised text-ink" : "text-ink-3 hover:text-ink"
          }`}
        >
          {o.text}
        </button>
      ))}
    </form>
  );
}
