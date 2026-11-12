"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { FormError, SubmitButton } from "@/components/form";
import type { FormState } from "@/lib/types";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

/** Admin form: server-rendered fields as children, one submit, inline result. */
export function ActionForm({
  action,
  submit,
  children,
  className = "flex flex-col gap-5",
  secondary,
}: {
  action: Action;
  submit: string;
  children: ReactNode;
  className?: string;
  secondary?: ReactNode;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <FormError error={state.error} />
      <div className="flex flex-wrap items-center gap-4">
        <SubmitButton className="btn btn-primary btn-sm">{submit}</SubmitButton>
        {secondary}
        {state.ok ? (
          <span role="status" className="text-[14px] text-success">
            {state.message || "Сохранено"}
          </span>
        ) : null}
      </div>
    </form>
  );
}

/** A one-button form for destructive or toggle actions, with an optional confirm. */
export function ButtonForm({
  action,
  fields,
  label,
  confirmText,
  className = "link-quiet text-[14px]",
}: {
  action: (fd: FormData) => Promise<void>;
  fields: Record<string, string>;
  label: string;
  confirmText?: string;
  className?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton className={className}>{label}</SubmitButton>
    </form>
  );
}

export function CopyButton({ text, label = "Скопировать" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-soft btn-sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? "Скопировано" : label}
    </button>
  );
}

/**
 * Image picker that downsizes the photo in the browser (longest side 1600px,
 * JPEG 0.85) before the form sends it: phone screenshots are 3–6MB, Vercel
 * functions accept 4.5MB.
 */
export function ImageInput({ name, id, required }: { name: string; id: string; required?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <input
        ref={ref}
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="field"
        required={required}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || file.size < 900_000) return;
          setBusy(true);
          try {
            const bitmap = await createImageBitmap(file);
            const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
            if (blob && ref.current) {
              const dt = new DataTransfer();
              dt.items.add(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
              ref.current.files = dt.files;
            }
          } catch {
            /* keep the original file; the server checks the size */
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy ? <span className="text-[13px] text-ink-3">Сжимаю картинку…</span> : null}
    </div>
  );
}

/** Disclosure tile: quiet circle with plus that turns into minus. */
export function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-tile-r bg-tile">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-16 w-full items-center justify-between gap-4 px-5 text-left text-[16px] font-medium text-ink md:px-6"
      >
        {title}
        <span aria-hidden="true" className="relative grid h-8 w-8 shrink-0 place-items-center rounded-full bg-raised">
          <span className="absolute h-[1.5px] w-3 rounded bg-ink" />
          <span className={`absolute h-3 w-[1.5px] rounded bg-ink transition-transform duration-300 ease-out ${open ? "scale-y-0" : ""}`} />
        </span>
      </button>
      {open ? <div className="sheet-in border-t border-line px-5 pb-6 pt-5 md:px-6">{children}</div> : null}
    </div>
  );
}

/** Venue → its offers, for the «new link» form. */
export function VenueOfferSelect({
  venues,
  offers,
  defaultVenue = "",
}: {
  venues: { id: string; name: string }[];
  offers: { id: string; venue_id: string; title: string }[];
  defaultVenue?: string;
}) {
  const [venue, setVenue] = useState(defaultVenue);
  const list = offers.filter((o) => o.venue_id === venue);
  return (
    <>
      <div className="flex flex-col gap-2">
        <label htmlFor="l-venue" className="label">
          Заведение
        </label>
        <select id="l-venue" name="venue_id" className="field" required value={venue} onChange={(e) => setVenue(e.target.value)}>
          <option value="" disabled>
            Выберите
          </option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="l-offer" className="label">
          Offer
        </label>
        <select key={venue} id="l-offer" name="offer_id" className="field" defaultValue={list[0]?.id ?? ""}>
          <option value="">Без offer</option>
          {list.map((o) => (
            <option key={o.id} value={o.id}>
              {o.title}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
