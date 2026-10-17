"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/data";

const level = z.enum(["none", "manager", "ceo"]);
const schema = z.object({
  company_name: z.string().trim().min(1).max(120),
  vat_rate: z.number().min(0).max(50),
  rounding: z.number().int().min(0).max(1000),
  default_validity_days: z.number().int().min(1).max(365),
  default_commitment_months: z.number().int().min(1).max(60),
  allowed_email_domains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/)).max(20),
  free_email_domains: z.array(z.string().trim().toLowerCase()).max(500),
  default_terms: z.string().max(20000),
  approval_rules: z.object({
    discountFreeMaxPercent: z.number().min(0).max(100),
    discountManagerMaxPercent: z.number().min(0).max(100),
    contractValueCeoThreshold: z.number().min(0),
    customItemLevel: level,
    belowFloorLevel: level,
    hybridBelowCatalogLevel: level,
    shortCommitmentLevel: level,
  }),
});
export type SettingsInput = z.input<typeof schema>;

export async function saveSettings(input: SettingsInput): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from("app_settings").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateUser(id: string, patch: { role?: "admin" | "approver" | "sales" | "viewer"; active?: boolean; full_name?: string }): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await requireAdmin();
  if (id === user.id && (patch.role && patch.role !== "admin" || patch.active === false)) return { ok: false, error: "לא ניתן להוריד הרשאות מעצמך" };
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function sendTestEmail(): Promise<{ ok: boolean; message: string }> {
  const { profile } = await requireAdmin();
  const { emailHtml, emailProvider, sendEmail } = await import("@/lib/email");
  const provider = emailProvider();
  if (!provider) return { ok: false, message: "לא הוגדר שירות מייל. יש להוסיף BREVO_API_KEY ו-EMAIL_FROM ב-Vercel ולבצע Redeploy." };
  const r = await sendEmail(
    profile.email,
    "בדיקת מייל ממערכת ההצעות",
    emailHtml({ title: "המייל עובד ✓", lines: ["זהו מייל בדיקה ממערכת ההצעות של דיגיטל אפקטיב.", `שירות: ${provider} · שולח: ${process.env.EMAIL_FROM || "(ברירת מחדל)"}`] }),
  );
  return r.ok
    ? { ok: true, message: `נשלח דרך ${provider} אל ${profile.email}. בדוק את תיבת הדואר (וגם ספאם).` }
    : { ok: false, message: `השליחה דרך ${provider} נכשלה: ${r.error}` };
}
