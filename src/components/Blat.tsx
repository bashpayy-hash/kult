"use client";

import Link from "next/link";
import { useActionState, useState, useSyncExternalStore } from "react";
import { cancelRedemption, createPick, redeemReward } from "@/app/blatActions";
import { Consent, errProps, Field, FormError, Honeypot, SubmitButton } from "@/components/form";
import { dicts, type Lang } from "@/lib/i18n/dicts";
import type { FormState } from "@/lib/types";

const noop = () => () => {};

/** Copy and (on phones) share a link. */
export function ShareLink({ url, text, lang }: { url: string; text: string; lang: Lang }) {
  const B = dicts[lang].blat;
  const [done, setDone] = useState(false);
  // Known only in the browser; false on the server, so the markup matches.
  const canShare = useSyncExternalStore(noop, () => "share" in navigator, () => false);
  return (
    <div className="flex flex-col gap-3">
      <p className="break-all rounded-[var(--radius-inner)] bg-raised px-4 py-3 font-mono text-[14px] text-ink">{url}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-soft btn-sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
            } catch {
              /* the link is on screen to copy by hand */
            }
            setDone(true);
            setTimeout(() => setDone(false), 1600);
          }}
        >
          {done ? B.copied : B.copy}
        </button>
        {canShare ? (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => navigator.share({ text, url }).catch(() => {})}>
            {B.share}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/**
 * «Посоветовать другу» on a venue page: a personal link to this place. A
 * browser that already recommends needs no name or phone again.
 */
export function PickForm({ venueId, venueName, lang, known }: { venueId: string; venueName: string; lang: Lang; known: string | null }) {
  const t = dicts[lang];
  const B = t.blat;
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(createPick, {});
  const fe = state.fieldErrors || {};
  const v = state.values || {};

  if (state.ok && v.url) {
    return (
      <div role="status" className="sheet-in flex flex-col gap-3 border-t border-line pt-5">
        <p className="label">{B.linkReady}</p>
        <ShareLink url={v.url} text={B.shareText(venueName)} lang={lang} />
        <Link href="/blat" className="link-quiet self-start text-[15px]">
          {B.myBlat} →
        </Link>
      </div>
    );
  }

  return (
    <div className="border-t border-line pt-5">
      <p className="label">{B.adviseTitle}</p>
      <p className="mt-2 max-w-[36rem] text-[15px] text-ink-2">{B.adviseText}</p>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="btn btn-soft btn-sm mt-4">
          {B.adviseTitle}
        </button>
      ) : (
        <form action={action} noValidate className="sheet-in mt-4 flex flex-col gap-4">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="venue_id" value={venueId} />
          <Honeypot />
          {known ? null : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={B.name} htmlFor="p-name" error={fe.name}>
                <input id="p-name" name="name" className="field" autoComplete="given-name" required defaultValue={v.name} {...errProps("p-name", fe.name)} />
              </Field>
              <Field label={B.phone} htmlFor="p-phone" error={fe.phone}>
                <input id="p-phone" name="phone" className="field" type="tel" inputMode="tel" autoComplete="tel" placeholder="+7 7__ ___ __ __" required defaultValue={v.phone} {...errProps("p-phone", fe.phone)} />
              </Field>
            </div>
          )}
          <Field label={B.note} htmlFor="p-note" optional={t.optional}>
            <input id="p-note" name="note" className="field" maxLength={200} placeholder={B.notePlaceholder} defaultValue={v.note} />
          </Field>
          {known ? null : <Consent id="p-consent" label={B.consent} linkLabel={t.more} error={fe.consent} />}
          <FormError error={state.error && !Object.keys(fe).length ? state.error : undefined} />
          <SubmitButton className="btn btn-primary btn-sm self-start">{B.getLink}</SubmitButton>
        </form>
      )}
    </div>
  );
}

/** «Получить» a treat for points: the code appears in «Ваши коды» above. */
export function RedeemButton({ rewardId, lang, secret, disabled, label }: { rewardId: string; lang: Lang; secret?: string; disabled: boolean; label: string }) {
  const [state, action] = useActionState<FormState, FormData>(redeemReward, {});
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="reward_id" value={rewardId} />
      {secret ? <input type="hidden" name="secret" value={secret} /> : null}
      <SubmitButton className="btn btn-primary btn-sm" disabled={disabled}>
        {label}
      </SubmitButton>
      {state.error ? <span role="alert" className="text-[13px] text-danger">{state.error}</span> : null}
    </form>
  );
}

export function CancelCode({ id, secret, label }: { id: string; secret?: string; label: string }) {
  return (
    <form action={cancelRedemption}>
      <input type="hidden" name="id" value={id} />
      {secret ? <input type="hidden" name="secret" value={secret} /> : null}
      <button type="submit" className="link-quiet text-[14px]">
        {label}
      </button>
    </form>
  );
}
