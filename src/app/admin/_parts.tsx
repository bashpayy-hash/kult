import type { ReactNode } from "react";
import { Orb, toneFor } from "@/components/Orb";

export function PageHead({ title, lead, action }: { title: string; lead?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-[34px] md:text-[44px]">{title}</h1>
        {lead ? <p className="mt-2 max-w-[44rem] text-[15px] text-ink-3">{lead}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap items-center gap-3">{action}</div> : null}
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[24px] md:text-[28px]">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, good }: { label: string; value: ReactNode; hint?: ReactNode; good?: boolean }) {
  return (
    <div className="rounded-tile-r bg-tile p-5 md:p-6">
      <p className="label">{label}</p>
      <p className={`mt-2 font-display text-[28px] font-semibold leading-none tracking-[-0.035em] tabular-nums sm:text-[34px] lg:text-[40px] ${good ? "text-success" : "text-ink"}`}>{value}</p>
      {hint ? <p className="mt-2 text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

const STATUS_TEXT: Record<string, string> = {
  active: "Активна",
  paused: "Пауза",
  archived: "Архив",
  new: "Новая",
  approved: "Одобрена",
  rejected: "Отклонена",
  arrived: "Пришли",
  no_show: "Не пришли",
  cancelled: "Отменена",
};
const STATUS_TONE: Record<string, string> = {
  active: "text-success",
  approved: "text-success",
  arrived: "text-success",
  paused: "text-ink-3",
  new: "text-accent",
  archived: "text-ink-4",
  rejected: "text-danger",
  no_show: "text-danger",
  cancelled: "text-ink-4",
};

export function StatusText({ status, text }: { status: string; text?: string }) {
  return <span className={`text-[13px] font-semibold ${STATUS_TONE[status] ?? "text-ink-3"}`}>{text ?? STATUS_TEXT[status] ?? status}</span>;
}

export function Person({ name, slug, sub }: { name: string; slug: string; sub?: ReactNode }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-3">
      <Orb tone={toneFor(slug)} size={28} still />
      <span className="min-w-0">
        <span className="block truncate text-ink">{name}</span>
        {sub ? <span className="block truncate text-[13px] text-ink-3">{sub}</span> : null}
      </span>
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-tile-r bg-tile px-6 py-8 text-ink-3">{children}</p>;
}

/** Plain server-rendered labelled input for admin forms. */
export function Input({
  label,
  name,
  id,
  defaultValue,
  type = "text",
  required,
  placeholder,
  hint,
  inputMode,
  className = "",
}: {
  label: string;
  name: string;
  id?: string;
  defaultValue?: string | number | null;
  type?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  inputMode?: "numeric" | "tel" | "text";
  className?: string;
}) {
  const fid = id ?? `f-${name}`;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <input
        id={fid}
        name={name}
        type={type}
        className="field"
        defaultValue={defaultValue ?? ""}
        required={required}
        placeholder={placeholder}
        inputMode={inputMode}
      />
      {hint ? <p className="text-[13px] text-ink-3">{hint}</p> : null}
    </div>
  );
}

export function TextArea({ label, name, id, defaultValue, rows = 3, className = "" }: { label: string; name: string; id?: string; defaultValue?: string | null; rows?: number; className?: string }) {
  const fid = id ?? `f-${name}`;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <textarea id={fid} name={name} rows={rows} className="field" defaultValue={defaultValue ?? ""} />
    </div>
  );
}

export function Select({
  label,
  name,
  id,
  options,
  defaultValue,
  required,
  className = "",
}: {
  label: string;
  name: string;
  id?: string;
  options: { value: string; label: string }[];
  defaultValue?: string | null;
  required?: boolean;
  className?: string;
}) {
  const fid = id ?? `f-${name}`;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <label htmlFor={fid} className="label">
        {label}
      </label>
      <select id={fid} name={name} className="field" defaultValue={defaultValue ?? ""} required={required}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Checkbox({ label, name, defaultChecked, id }: { label: string; name: string; defaultChecked?: boolean; id?: string }) {
  const fid = id ?? `f-${name}`;
  return (
    <label htmlFor={fid} className="flex cursor-pointer items-center gap-3 text-[15px] text-ink-2">
      <input id={fid} name={name} type="checkbox" value="1" className="check" defaultChecked={defaultChecked} />
      {label}
    </label>
  );
}

export const STATUS_OPTIONS = [
  { value: "active", label: "Активна" },
  { value: "paused", label: "Пауза" },
  { value: "archived", label: "Архив" },
];
