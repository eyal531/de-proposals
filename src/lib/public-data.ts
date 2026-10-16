import "server-only";
import { createAdminClient } from "./supabase/server";
import { normalizeSettings } from "./data";
import type { Proposal, ProposalItem } from "./types";

export const TOKEN_RE = /^[0-9a-f]{36}$/;

export async function loadByToken(token: string) {
  if (!TOKEN_RE.test(token)) return null;
  const db = createAdminClient();
  const { data: proposal } = await db.from("proposals").select("*").eq("public_token", token).maybeSingle();
  if (!proposal) return null;
  const [{ data: items }, { data: settings }] = await Promise.all([
    db.from("proposal_items").select("*").eq("proposal_id", proposal.id).order("sort"),
    db.from("app_settings").select("*").eq("id", 1).maybeSingle(),
  ]);
  return { db, proposal: proposal as Proposal, items: (items ?? []) as ProposalItem[], settings: normalizeSettings(settings) };
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? null;
}
