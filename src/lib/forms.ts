/** Small FormData readers: trimmed strings and integers. */
export function str(fd: FormData, name: string, max = 300): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function strOrNull(fd: FormData, name: string, max = 300): string | null {
  return str(fd, name, max) || null;
}

/** Integer from a field; spaces and thin spaces allowed ("45 000"). null if empty, NaN if not a number. */
export function int(fd: FormData, name: string): number | null {
  const raw = str(fd, name, 40).replace(/[\s  ]/g, "");
  if (!raw) return null;
  if (!/^-?\d+$/.test(raw)) return NaN;
  return Number(raw);
}

export function bool(fd: FormData, name: string): boolean {
  const v = fd.get(name);
  return v === "1" || v === "on" || v === "true";
}

export function values(fd: FormData, names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) out[n] = str(fd, n, 1000);
  return out;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(x: string): boolean {
  return UUID_RE.test(x);
}
