"use client";

import { useActionState, useEffect, useState } from "react";
import { addMemberVisit, addPhraseGuest, markArrived, markNoShow, removeEntry } from "./actions";
import { errProps, Field, FormError, SubmitButton } from "@/components/form";
import { Orb, toneFor } from "@/components/Orb";
import { dicts, type Lang } from "@/lib/i18n/dicts";
import { formatMoney, formatPhone, formatTime } from "@/lib/format";
import type { BookingStatus, FormState } from "@/lib/types";

export type HostBooking = {
  id: string;
  guest_name: string;
  phone: string;
  booking_time: string;
  party_size: number;
  comment: string | null;
  status: BookingStatus;
  member_name: string | null;
  member_slug: string | null;
  table_label: string | null;
  guests_count: number | null;
  check_amount: number | null;
};

export type HostLink = { id: string; member_name: string; member_slug: string; member_reward: string | null };

const statusTone: Record<BookingStatus, string> = {
  new: "text-ink-3",
  arrived: "text-success",
  no_show: "text-danger",
  cancelled: "text-ink-4",
};

/** Closes the panel once the action reports success. */
function useCloseOnOk(state: FormState, close: () => void) {
  useEffect(() => {
    if (state.ok) close();
  }, [state, close]);
}

export function BookingCard({ b, token, lang }: { b: HostBooking; token: string; lang: Lang }) {
  const t = dicts[lang].host;
  const [open, setOpen] = useState(false);
  return (
    <article className="rounded-tile-r bg-tile p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-display text-[28px] font-semibold leading-none tracking-[-0.035em] tabular-nums text-ink">
            {formatTime(b.booking_time)}
            {b.table_label ? <span className="ml-3 text-[17px] font-medium tracking-normal text-accent">{dicts[lang].booking.tableName(b.table_label)}</span> : null}
          </p>
          <p className="mt-2 text-[17px] text-ink">
            {b.guest_name} · {t.guests(b.party_size)}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[14px] text-ink-3">
            <a href={`tel:${b.phone}`} className="link-quiet">
              {formatPhone(b.phone)}
            </a>
            <span aria-hidden="true">·</span>
            {b.member_name && b.member_slug ? (
              <span className="inline-flex items-center gap-1.5">
                <Orb tone={toneFor(b.member_slug)} size={14} still />
                {t.from(b.member_name)}
              </span>
            ) : (
              <span>{t.fromCatalog}</span>
            )}
          </p>
          {b.comment ? <p className="mt-2 text-[14px] text-ink-2">{b.comment}</p> : null}
        </div>
        <p className={`shrink-0 text-[13px] font-semibold ${statusTone[b.status]}`}>{t.status[b.status]}</p>
      </div>

      {b.status === "arrived" && !open ? (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4 text-[15px]">
          <span className="text-ink-2">
            {t.guests(b.guests_count ?? 0)} · {formatMoney(b.check_amount)}
          </span>
          <button type="button" className="link-quiet text-[14px]" onClick={() => setOpen(true)}>
            {t.edit}
          </button>
        </div>
      ) : null}

      {b.status !== "arrived" && !open ? (
        <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}>
            {t.arrivedBtn}
          </button>
          {b.status === "new" ? (
            <form action={markNoShow}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="booking_id" value={b.id} />
              <SubmitButton className="btn btn-soft btn-sm">{t.noShowBtn}</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}

      {open ? <ArrivedForm b={b} token={token} lang={lang} close={() => setOpen(false)} /> : null}
    </article>
  );
}

function ArrivedForm({ b, token, lang, close }: { b: HostBooking; token: string; lang: Lang; close: () => void }) {
  const t = dicts[lang].host;
  const [state, action] = useActionState<FormState, FormData>(markArrived, {});
  useCloseOnOk(state, close);
  const fe = state.fieldErrors || {};
  const gid = `g-${b.id}`, cid = `c-${b.id}`;
  return (
    <form action={action} className="sheet-in mt-4 flex flex-col gap-4 border-t border-line pt-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="booking_id" value={b.id} />
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.actualGuests} htmlFor={gid} error={fe.guests_count}>
          <input id={gid} name="guests_count" type="number" inputMode="numeric" min={1} max={50} className="field" defaultValue={b.guests_count ?? b.party_size} required {...errProps(gid, fe.guests_count)} />
        </Field>
        <Field label={t.checkAmount} htmlFor={cid} error={fe.check_amount}>
          <input id={cid} name="check_amount" inputMode="numeric" className="field" placeholder="0" defaultValue={b.check_amount ?? ""} required autoFocus {...errProps(cid, fe.check_amount)} />
        </Field>
      </div>
      <FormError error={state.error} />
      <div className="flex items-center gap-4">
        <SubmitButton className="btn btn-primary btn-sm">{t.save}</SubmitButton>
        <button type="button" className="link-quiet text-[14px]" onClick={close}>
          {t.cancel}
        </button>
      </div>
    </form>
  );
}

function MemberSelect({ id, links, lang, error }: { id: string; links: HostLink[]; lang: Lang; error?: string }) {
  const t = dicts[lang].host;
  return (
    <select id={id} name="link_id" className="field" required defaultValue={links.length === 1 ? links[0].id : ""} {...errProps(id, error)}>
      <option value="" disabled>
        {t.choose}
      </option>
      {links.map((l) => (
        <option key={l.id} value={l.id}>
          {l.member_name}
        </option>
      ))}
    </select>
  );
}

function Panel({ title, children, open, setOpen }: { title: string; children: React.ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="rounded-tile-r bg-tile">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-5 text-left text-[16px] font-medium text-ink"
      >
        {title}
        {/* Disclosure: a quiet circle with plus that turns into minus, no chevron. */}
        <span aria-hidden="true" className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised">
          <span className="absolute h-[1.5px] w-3 rounded bg-ink" />
          <span className={`absolute h-3 w-[1.5px] rounded bg-ink transition-transform duration-300 ease-out ${open ? "scale-y-0" : ""}`} />
        </span>
      </button>
      {open ? <div className="sheet-in border-t border-line px-5 pb-5 pt-4">{children}</div> : null}
    </div>
  );
}

export function PhraseGuestPanel({ links, token, date, lang }: { links: HostLink[]; token: string; date: string; lang: Lang }) {
  const t = dicts[lang].host;
  const [open, setOpen] = useState(false);
  return (
    <Panel title={t.phraseGuest} open={open} setOpen={setOpen}>
      <PhraseGuestForm links={links} token={token} date={date} lang={lang} close={() => setOpen(false)} />
    </Panel>
  );
}

function PhraseGuestForm({ links, token, date, lang, close }: { links: HostLink[]; token: string; date: string; lang: Lang; close: () => void }) {
  const t = dicts[lang].host;
  const [state, action] = useActionState<FormState, FormData>(addPhraseGuest, {});
  useCloseOnOk(state, close);
  const fe = state.fieldErrors || {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="date" value={date} />
      <Field label={t.phraseFrom} htmlFor="pg-member" error={fe.link_id}>
        <MemberSelect id="pg-member" links={links} lang={lang} error={fe.link_id} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.actualGuests} htmlFor="pg-guests" error={fe.guests_count}>
          <input id="pg-guests" name="guests_count" type="number" inputMode="numeric" min={1} max={50} className="field" defaultValue={1} required {...errProps("pg-guests", fe.guests_count)} />
        </Field>
        <Field label={t.checkAmount} htmlFor="pg-check" error={fe.check_amount}>
          <input id="pg-check" name="check_amount" inputMode="numeric" className="field" placeholder="0" required {...errProps("pg-check", fe.check_amount)} />
        </Field>
      </div>
      <FormError error={state.error} />
      <div>
        <SubmitButton className="btn btn-primary btn-sm">{t.save}</SubmitButton>
      </div>
    </form>
  );
}

export function MemberVisitPanel({ links, token, date, lang }: { links: HostLink[]; token: string; date: string; lang: Lang }) {
  const t = dicts[lang].host;
  const [open, setOpen] = useState(false);
  return (
    <Panel title={t.memberVisit} open={open} setOpen={setOpen}>
      <MemberVisitForm links={links} token={token} date={date} lang={lang} close={() => setOpen(false)} />
    </Panel>
  );
}

function MemberVisitForm({ links, token, date, lang, close }: { links: HostLink[]; token: string; date: string; lang: Lang; close: () => void }) {
  const t = dicts[lang].host;
  const [state, action] = useActionState<FormState, FormData>(addMemberVisit, {});
  useCloseOnOk(state, close);
  const [linkId, setLinkId] = useState(links.length === 1 ? links[0].id : "");
  const reward = links.find((l) => l.id === linkId)?.member_reward || "";
  const fe = state.fieldErrors || {};
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="lang" value={lang} />
      <Field label={t.member} htmlFor="mv-member" error={fe.link_id}>
        <select id="mv-member" name="link_id" className="field" required value={linkId} onChange={(e) => setLinkId(e.target.value)} {...errProps("mv-member", fe.link_id)}>
          <option value="" disabled>
            {t.choose}
          </option>
          {links.map((l) => (
            <option key={l.id} value={l.id}>
              {l.member_name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t.visitDate} htmlFor="mv-date" error={fe.visit_date}>
        <input id="mv-date" name="visit_date" type="date" className="field" defaultValue={date} required {...errProps("mv-date", fe.visit_date)} />
      </Field>
      <Field label={t.received} htmlFor="mv-received">
        {/* key: switching the member refills the field with her offer. */}
        <input key={linkId} id="mv-received" name="received" className="field" defaultValue={reward} />
      </Field>
      <FormError error={state.error} />
      <div>
        <SubmitButton className="btn btn-primary btn-sm">{t.save}</SubmitButton>
      </div>
    </form>
  );
}

export function LogEntry({
  token,
  lang,
  kind,
  id,
  slug,
  title,
  meta,
  removable = true,
}: {
  token: string;
  lang: Lang;
  kind: "guest" | "member";
  id: string;
  slug: string;
  title: string;
  meta: string;
  removable?: boolean;
}) {
  const t = dicts[lang].host;
  return (
    <li className="flex items-center gap-3 py-4">
      <Orb tone={toneFor(slug)} size={28} still />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] text-ink">{title}</p>
        {meta ? <p className="text-[14px] text-ink-3">{meta}</p> : null}
      </div>
      {removable ? (
        <form
          action={removeEntry}
          onSubmit={(e) => {
            if (!confirm(t.removeConfirm)) e.preventDefault();
          }}
        >
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="id" value={id} />
          <SubmitButton className="link-quiet text-[14px]">{t.remove}</SubmitButton>
        </form>
      ) : null}
    </li>
  );
}
