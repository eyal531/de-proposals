export function ils(v: number | null | undefined, opts: { decimals?: boolean } = {}): string {
  const n = Number(v ?? 0);
  return `${n.toLocaleString("he-IL", { maximumFractionDigits: opts.decimals ? 2 : 0, minimumFractionDigits: 0 })} ₪`;
}

export function dateHe(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("he-IL", { day: "numeric", month: "numeric", year: "numeric" });
}

export function dateTimeHe(v: string | null | undefined): string {
  if (!v) return "—";
  return new Date(v).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function addDays(days: number, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isExpired(validUntil: string | null | undefined): boolean {
  if (!validUntil) return false;
  const today = new Date().toISOString().slice(0, 10);
  return validUntil < today;
}
