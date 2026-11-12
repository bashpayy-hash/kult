"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

export function Field({
  label,
  htmlFor,
  hint,
  error,
  optional,
  className = "",
  children,
}: {
  label: ReactNode;
  htmlFor: string;
  hint?: ReactNode;
  error?: string;
  optional?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={htmlFor} className="label flex items-baseline justify-between gap-3">
        <span>{label}</span>
        {optional ? <span className="font-normal text-ink-4">{optional}</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

/** aria props for an input that may carry a field error. */
export function errProps(id: string, error?: string) {
  return error ? { "aria-invalid": true as const, "aria-describedby": `${id}-error` } : {};
}

export function Consent({
  id = "consent",
  label,
  linkLabel,
  error,
  defaultChecked,
}: {
  id?: string;
  label: string;
  linkLabel: string;
  error?: string;
  defaultChecked?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[15px] text-ink-2">
        <input id={id} name="consent" type="checkbox" value="1" className="check" defaultChecked={defaultChecked} {...errProps(id, error)} />
        <span>
          {label}.{" "}
          <a href="/privacy" target="_blank" className="link-quiet">
            {linkLabel}
          </a>
        </span>
      </label>
      {error ? (
        <p id={`${id}-error`} className="text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  pendingLabel,
}: {
  children: ReactNode;
  className?: string;
  pendingLabel?: ReactNode;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/** Off-screen trap field: people never fill it, form bots do. */
export function Honeypot() {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

export function FormError({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p role="alert" className="rounded-[var(--radius-inner)] border border-danger/30 bg-danger/10 px-4 py-3 text-[14px] text-danger">
      {error}
    </p>
  );
}
