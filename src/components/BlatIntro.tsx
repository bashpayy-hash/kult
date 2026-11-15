import type { Dict } from "@/lib/i18n/dicts";

/** The title and three steps of blat; `short` drops the steps for someone already in. */
export function BlatIntro({ t, short = false }: { t: Dict; short?: boolean }) {
  const B = t.blat;
  return (
    <div className="max-w-[56rem]">
      <h1 className="rise text-[44px] leading-[1] md:text-[72px]">{B.title}</h1>
      {short ? null : (
        <>
          <p className="rise rise-1 mt-4 max-w-[38rem] text-[17px] text-ink-2 md:text-[19px]">{B.lead}</p>
          <h2 className="sr-only">{B.howTitle}</h2>
          <ol className="rise rise-2 mt-8 grid gap-3 md:grid-cols-3">
            {B.how.map((step, i) => (
              <li key={i} className="flex gap-4 bg-raised px-5 py-4 text-[15px] text-ink-2">
                <span className="numerals text-[32px] leading-none text-accent">{i + 1}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
