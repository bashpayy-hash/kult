"use client";

import { useActionState } from "react";
import { submitMemberApplication, submitPartnerApplication } from "@/app/actions";
import { Consent, errProps, Field, FormError, Honeypot, SubmitButton } from "@/components/form";
import { dicts, type Lang } from "@/lib/i18n/dicts";
import { CATEGORIES, type FormState } from "@/lib/types";

function Success({ title, text }: { title: string; text: string }) {
  return (
    <div role="status" className="sheet-in flex flex-col items-start gap-3 py-6">
      <h3 className="text-[28px]">{title}</h3>
      <p className="max-w-[34rem] text-ink-2">{text}</p>
    </div>
  );
}

export function MemberApplicationForm({ lang }: { lang: Lang }) {
  const t = dicts[lang];
  const f = t.landing.member;
  const [state, action] = useActionState<FormState, FormData>(submitMemberApplication, {});
  if (state.ok) return <Success title={f.successTitle} text={f.successText} />;
  const fe = state.fieldErrors || {};
  const v = state.values || {};
  return (
    <form action={action} noValidate className="relative flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      <Honeypot />
      <div className="grid gap-5 md:grid-cols-[1fr_9rem]">
        <Field label={f.name} htmlFor="m-name" error={fe.name}>
          <input id="m-name" name="name" className="field" autoComplete="given-name" required defaultValue={v.name} {...errProps("m-name", fe.name)} />
        </Field>
        <Field label={f.age} htmlFor="m-age" hint={f.ageHint} error={fe.age}>
          <input id="m-age" name="age" className="field" inputMode="numeric" type="number" min={18} max={99} required defaultValue={v.age} {...errProps("m-age", fe.age)} />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={f.city} htmlFor="m-city" error={fe.city}>
          <input id="m-city" name="city" className="field" autoComplete="address-level2" required defaultValue={v.city ?? f.cityDefault} {...errProps("m-city", fe.city)} />
        </Field>
        <Field label={f.instagram} htmlFor="m-ig" error={fe.instagram}>
          <input id="m-ig" name="instagram" className="field" placeholder="@username" autoCapitalize="none" autoCorrect="off" required defaultValue={v.instagram} {...errProps("m-ig", fe.instagram)} />
        </Field>
      </div>
      <Field label={f.interests} htmlFor="m-int" optional={t.optional}>
        <textarea id="m-int" name="interests" className="field" rows={3} placeholder={f.interestsPlaceholder} defaultValue={v.interests} />
      </Field>
      <Consent id="m-consent" label={f.consent} linkLabel={t.more} error={fe.consent} defaultChecked={v.consent === "1"} />
      <FormError error={state.error && !Object.keys(fe).length ? state.error : undefined} />
      <div>
        <SubmitButton>{f.submit}</SubmitButton>
      </div>
    </form>
  );
}

export function PartnerApplicationForm({ lang }: { lang: Lang }) {
  const t = dicts[lang];
  const f = t.landing.partner;
  const [state, action] = useActionState<FormState, FormData>(submitPartnerApplication, {});
  if (state.ok) return <Success title={f.successTitle} text={f.successText} />;
  const fe = state.fieldErrors || {};
  const v = state.values || {};
  return (
    <form action={action} noValidate className="relative flex flex-col gap-5">
      <input type="hidden" name="lang" value={lang} />
      <Honeypot />
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={f.venueName} htmlFor="p-venue" error={fe.venue_name}>
          <input id="p-venue" name="venue_name" className="field" autoComplete="organization" required defaultValue={v.venue_name} {...errProps("p-venue", fe.venue_name)} />
        </Field>
        <Field label={f.category} htmlFor="p-cat" error={fe.category}>
          <select id="p-cat" name="category" className="field" required defaultValue={v.category ?? "restaurant"} {...errProps("p-cat", fe.category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={f.contactName} htmlFor="p-contact" error={fe.contact_name}>
          <input id="p-contact" name="contact_name" className="field" autoComplete="name" required defaultValue={v.contact_name} {...errProps("p-contact", fe.contact_name)} />
        </Field>
        <Field label={f.phone} htmlFor="p-phone" error={fe.phone}>
          <input id="p-phone" name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" required defaultValue={v.phone} {...errProps("p-phone", fe.phone)} />
        </Field>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <Field label={f.instagram} htmlFor="p-ig" optional={t.optional}>
          <input id="p-ig" name="instagram" className="field" placeholder="@venue" autoCapitalize="none" autoCorrect="off" defaultValue={v.instagram} />
        </Field>
        <Field label={f.avgCheck} htmlFor="p-check" optional={t.optional} error={fe.avg_check}>
          <input id="p-check" name="avg_check" className="field" inputMode="numeric" placeholder="15 000" defaultValue={v.avg_check} {...errProps("p-check", fe.avg_check)} />
        </Field>
      </div>
      <Consent id="p-consent" label={f.consent} linkLabel={t.more} error={fe.consent} defaultChecked={v.consent === "1"} />
      <FormError error={state.error && !Object.keys(fe).length ? state.error : undefined} />
      <div>
        <SubmitButton>{f.submit}</SubmitButton>
      </div>
    </form>
  );
}
