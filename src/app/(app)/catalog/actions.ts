"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/data";

const schema = z.object({
  id: z.string().uuid().optional(),
  category: z.string().trim().min(1).max(100),
  name: z.string().trim().min(1).max(200),
  client_name: z.string().trim().min(1).max(200),
  description: z.string().max(5000),
  deliverables: z.array(z.string().trim().max(300)).max(30),
  exclusions: z.array(z.string().trim().max(300)).max(30),
  pricing_model: z.enum(["fixed_monthly", "one_time", "hourly", "hour_bank", "media_percent", "hybrid_max", "base_plus_percent", "media_tiers", "per_unit"]),
  params: z.record(z.string(), z.unknown()),
  floor_price: z.number().min(0).nullable(),
  min_commitment_months: z.number().int().min(0).max(60).nullable(),
  ai_profile: z.string().max(40).nullable(),
  active: z.boolean(),
  sort: z.number().int(),
});

export type ServiceInput = z.input<typeof schema>;

export async function saveService(input: ServiceInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  const { supabase, user } = await requireAdmin();
  const { id, ...row } = parsed.data;
  const clean = { ...row, deliverables: row.deliverables.filter(Boolean), exclusions: row.exclusions.filter(Boolean), updated_by: user.id };
  const q = id ? supabase.from("services").update(clean).eq("id", id).select("id").single() : supabase.from("services").insert(clean).select("id").single();
  const { data, error } = await q;
  if (error || !data) return { ok: false, error: error?.message ?? "שגיאה" };
  revalidatePath("/catalog");
  return { ok: true, id: data.id as string };
}
