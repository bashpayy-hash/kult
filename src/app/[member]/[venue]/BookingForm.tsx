"use client";

import { useActionState, useState } from "react";
import { submitBooking } from "@/app/actions";
import { Consent, errProps, Field, FormError, Honeypot, SubmitButton } from "@/components/form";
import { Orb } from "@/components/Orb";
import { dicts, type Lang } from "@/lib/i18n/dicts";
import type { FormState } from "@/lib/types";

export function BookingForm({ lang, linkId, phrase, today }: { lang: Lang; linkId: string; phrase: string; today: string }) {
  const t = dicts[lang];
  const f = t.invite;
  // `key` remounts the form for «Ещё одна бронь», which also resets the action state.
  const [round, setRound] = useState(0);
  return <Inner key={round} lang={lang} linkId={linkId} phrase={phrase} today={today} onAgain={() => setRound((r) => r + 1)} f={f} t={t} />;
}

function Inner({
  lang,
  linkId,
  phrase,
  today,
  onAgain,
  f,
  t,
}: {
  lang: Lang;
  linkId: string;
  phrase: string;
  today: string;
  onAgain: () => void;
  f: (typeof dicts)["ru"]["invite"];
  t: (typeof dicts)["ru"];
}) {
  const [state, action] = useActionState<FormState, FormData>(submitBooking, {});
  if (state.ok) {
    return (
      <div role="status" className="sheet-in flex flex-col items-start gap-5 py-2">
        <Orb tone="aqua" size={64} />
        <h3 className="text-[28px]">{f.successTitle}</h3>
        <p className="text-ink-2">{f.successText(phrase)}</p>
        <button type="button" onClick={onAgain} className="link-quiet text-[15px]">
          {f.another}
        </button>
      </div>
    );
  }
  const fe = state.fieldErrors || {};
  const v = state.values || {};
  return (
    <form action={action} noValidate className="relative flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="link_id" value={linkId} />
      <Honeypot />
      <Field label={f.guestName} htmlFor="b-name" error={fe.guest_name}>
        <input id="b-name" name="guest_name" className="field" autoComplete="given-name" required defaultValue={v.guest_name} {...errProps("b-name", fe.guest_name)} />
      </Field>
      <Field label={f.phone} htmlFor="b-phone" error={fe.phone}>
        <input id="b-phone" name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" required defaultValue={v.phone} {...errProps("b-phone", fe.phone)} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label={f.date} htmlFor="b-date" error={fe.booking_date}>
          <input id="b-date" name="booking_date" type="date" className="field" min={today} required defaultValue={v.booking_date ?? today} {...errProps("b-date", fe.booking_date)} />
        </Field>
        <Field label={f.time} htmlFor="b-time" error={fe.booking_time}>
          <input id="b-time" name="booking_time" type="time" className="field" step={900} required defaultValue={v.booking_time ?? "19:00"} {...errProps("b-time", fe.booking_time)} />
        </Field>
      </div>
      <Field label={f.party} htmlFor="b-party" error={fe.party_size}>
        <input id="b-party" name="party_size" type="number" inputMode="numeric" min={1} max={30} className="field" required defaultValue={v.party_size ?? "2"} {...errProps("b-party", fe.party_size)} />
      </Field>
      <Field label={f.comment} htmlFor="b-comment" optional={t.optional}>
        <textarea id="b-comment" name="comment" rows={2} className="field" defaultValue={v.comment} />
      </Field>
      <Consent id="b-consent" label={f.consent} linkLabel={t.more} error={fe.consent} defaultChecked={v.consent === "1"} />
      <FormError error={state.error && !Object.keys(fe).length ? state.error : undefined} />
      <SubmitButton className="btn btn-primary w-full sm:w-auto">{f.submit}</SubmitButton>
    </form>
  );
}
