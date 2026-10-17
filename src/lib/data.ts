import "server-only";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import { DEFAULT_APPROVAL_RULES } from "./pricing/approvals";
import { DEFAULT_BRAND, type Profile, type Settings } from "./types";

export async function getSessionProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null as Profile | null };
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: (data as Profile | null) && (data as Profile).active ? (data as Profile) : null };
}

/** For server actions / pages that require a team member. */
export async function requireMember() {
  const ctx = await getSessionProfile();
  if (!ctx.user) redirect("/login");
  if (!ctx.profile) redirect("/no-access");
  return { supabase: ctx.supabase, user: ctx.user, profile: ctx.profile };
}

export async function requireAdmin() {
  const ctx = await requireMember();
  if (ctx.profile.role !== "admin") throw new Error("פעולה זו מותרת למנהל מערכת בלבד");
  return ctx;
}

export function normalizeSettings(row: Record<string, unknown> | null): Settings {
  const r = (row ?? {}) as Partial<Settings>;
  return {
    company_name: r.company_name ?? "דיגיטל אפקטיב",
    vat_rate: Number(r.vat_rate ?? 18),
    rounding: Number(r.rounding ?? 1),
    default_validity_days: Number(r.default_validity_days ?? 14),
    default_commitment_months: Number(r.default_commitment_months ?? 6),
    allowed_email_domains: r.allowed_email_domains ?? [],
    free_email_domains: r.free_email_domains ?? [],
    approval_rules: { ...DEFAULT_APPROVAL_RULES, ...(r.approval_rules ?? {}) },
    default_terms: r.default_terms ?? "",
    default_media_fee_percent: Number(r.default_media_fee_percent ?? 20),
    brand: { ...DEFAULT_BRAND, ...(r.brand ?? {}) },
  };
}

/** Public base URL: NEXT_PUBLIC_SITE_URL if set, otherwise the current request host. */
export async function siteUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export async function getSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).maybeSingle();
  return normalizeSettings(data);
}
