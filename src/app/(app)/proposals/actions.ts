"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSettings, requireMember, siteUrl } from "@/lib/data";
import { addDays } from "@/lib/format";
import { proposalTitle, salutation } from "@/lib/greeting";
import { normalizeWebsite } from "@/lib/email-domain";
import { calcProposal, LEVEL_RANK } from "@/lib/proposal-calc";
import type { ApprovalLevel } from "@/lib/pricing/approvals";
import { notifyApprovalDecided, notifyApprovalRequested } from "@/lib/notify";
import { emailConfigured } from "@/lib/email";
import type { ContentBlock, Proposal, ProposalItem, Section, Service } from "@/lib/types";

type Supa = Awaited<ReturnType<typeof requireMember>>["supabase"];
export type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

async function loadBundle(supabase: Supa, id: string) {
  const [{ data: proposal }, { data: items }, { data: services }, settings] = await Promise.all([
    supabase.from("proposals").select("*").eq("id", id).single(),
    supabase.from("proposal_items").select("*").eq("proposal_id", id).order("sort"),
    supabase.from("services").select("*"),
    getSettings(supabase),
  ]);
  if (!proposal) throw new Error("ההצעה לא נמצאה");
  return { proposal: proposal as Proposal, items: (items ?? []) as ProposalItem[], services: (services ?? []) as Service[], settings };
}

async function lastApprovedLevel(supabase: Supa, id: string): Promise<ApprovalLevel> {
  const { data } = await supabase
    .from("approvals")
    .select("level")
    .eq("proposal_id", id)
    .eq("decision", "approved")
    .order("decided_at", { ascending: false })
    .limit(1);
  return ((data?.[0]?.level as ApprovalLevel) ?? "none") as ApprovalLevel;
}

async function logEvent(supabase: Supa, proposalId: string, type: string, actor: string, meta: Record<string, unknown> = {}) {
  await supabase.from("proposal_events").insert({ proposal_id: proposalId, type, actor, meta });
}

function itemFromService(s: Service, sort: number) {
  return {
    service_id: s.id,
    name: s.client_name,
    description: s.description,
    deliverables: s.deliverables,
    pricing_model: s.pricing_model,
    params: structuredClone(s.params ?? {}),
    quantity: 1,
    discount: null,
    kind: "required" as const,
    group_key: null,
    selected: true,
    is_custom: false,
    sort,
  };
}

function sectionsFromBlocks(blocks: ContentBlock[], serviceIds: string[]): Section[] {
  return blocks
    .filter((b) => b.active && (b.service_ids.length === 0 || b.service_ids.some((id) => serviceIds.includes(id))))
    .sort((a, b) => a.sort - b.sort)
    .map((b) => ({ id: crypto.randomUUID(), title: b.title, body: b.body, visible: true, source: "library", status: "approved", locked: b.locked }));
}

// ---------- create ----------

const recipientSchema = z.object({ name: z.string().trim().max(120), role: z.string().trim().max(120).optional().default(""), email: z.string().trim().max(200).optional().default("") });

const createSchema = z.object({
  recipients: z.array(recipientSchema).max(3),
  companyName: z.string().trim().max(200).optional().default(""),
  phone: z.string().trim().max(50).optional().default(""),
  website: z.string().trim().max(300).optional().default(""),
  addressForm: z.enum(["plural", "male", "female"]).default("plural"),
  titleBase: z.string().trim().min(1).max(200),
  callNotes: z.string().max(10000).optional().default(""),
  serviceIds: z.array(z.string().uuid()).max(30).default([]),
});

export async function createProposal(input: z.input<typeof createSchema>): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return fail("נתונים לא תקינים: " + parsed.error.issues[0]?.message);
  const d = parsed.data;
  const { supabase, user } = await requireMember();
  const settings = await getSettings(supabase);
  const recipients = d.recipients.filter((r) => r.name);
  const website = normalizeWebsite(d.website);

  let clientId: string | null = null;
  if (d.companyName) {
    const { data: existing } = await supabase.from("clients").select("id, website").ilike("name", d.companyName).limit(1);
    if (existing?.length) {
      clientId = existing[0].id as string;
      if (website && !existing[0].website) await supabase.from("clients").update({ website }).eq("id", clientId);
    } else {
      const { data: c, error } = await supabase.from("clients").insert({ name: d.companyName, website, created_by: user.id }).select("id").single();
      if (error) return fail(error.message);
      clientId = c.id as string;
    }
  }
  if (recipients.length) {
    await supabase.from("contacts").insert(
      recipients.map((r, i) => ({
        client_id: clientId,
        full_name: r.name,
        role: r.role || null,
        email: r.email || null,
        phone: i === 0 ? d.phone || null : null,
        address_form: d.addressForm,
      })),
    );
  }

  const [{ data: services }, { data: blocks }] = await Promise.all([
    supabase.from("services").select("*").in("id", d.serviceIds.length ? d.serviceIds : ["00000000-0000-0000-0000-000000000000"]),
    supabase.from("content_blocks").select("*"),
  ]);
  const chosen = d.serviceIds.map((id) => (services ?? []).find((s) => s.id === id)).filter(Boolean) as Service[];

  const intro = `${salutation(recipients)}\nתודה על השיחה ועל ההזדמנות להציג לכם את ההצעה שלנו. ריכזנו כאן את ההבנה שלנו לגבי הצרכים שלכם, את הפתרון שאנחנו מציעים ואת ההשקעה הנדרשת.`;

  const { data: p, error } = await supabase
    .from("proposals")
    .insert({
      title: proposalTitle(d.titleBase, d.companyName, recipients[0]?.name),
      client_id: clientId,
      company_name: d.companyName || null,
      recipients,
      address_form: d.addressForm,
      website,
      call_notes: d.callNotes,
      intro,
      sections: sectionsFromBlocks((blocks ?? []) as ContentBlock[], d.serviceIds),
      terms: settings.default_terms,
      commitment_months: settings.default_commitment_months,
      media_fee_percent: settings.default_media_fee_percent,
      valid_until: addDays(settings.default_validity_days),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !p) return fail(error?.message ?? "שגיאה ביצירת ההצעה");

  if (chosen.length) {
    const { error: e2 } = await supabase.from("proposal_items").insert(chosen.map((s, i) => ({ ...itemFromService(s, i), proposal_id: p.id })));
    if (e2) return fail(e2.message);
  }
  await recalcAndStore(supabase, p.id as string);
  await logEvent(supabase, p.id as string, "created", user.id);
  revalidatePath("/proposals");
  return { ok: true, id: p.id as string };
}

async function recalcAndStore(supabase: Supa, id: string) {
  const b = await loadBundle(supabase, id);
  const { pricing, approval } = calcProposal(b.proposal, b.items, b.services, b.settings);
  await supabase.from("proposals").update({ totals: pricing.totals, approval_level: approval.level, approval_reasons: approval.reasons }).eq("id", id);
  return { ...b, pricing, approval };
}

// ---------- save ----------

const discountSchema = z.object({ type: z.enum(["percent", "amount"]), value: z.number().min(0) }).nullable();
const itemSchema = z.object({
  id: z.string().optional(),
  service_id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(""),
  deliverables: z.array(z.string().max(300)).max(30).default([]),
  pricing_model: z.enum(["fixed_monthly", "one_time", "hourly", "hour_bank", "media_percent", "hybrid_max", "base_plus_percent", "media_tiers", "per_unit"]),
  params: z.record(z.string(), z.unknown()),
  quantity: z.number().min(0).max(100000).default(1),
  discount: discountSchema.default(null),
  kind: z.enum(["required", "optional", "alternative"]),
  group_key: z.string().max(60).nullable().default(null),
  selected: z.boolean(),
  is_custom: z.boolean().default(false),
});
const sectionSchema = z.object({
  id: z.string(),
  title: z.string().max(200),
  body: z.string().max(20000),
  visible: z.boolean(),
  source: z.enum(["library", "manual", "ai"]),
  status: z.enum(["draft", "edited", "approved"]),
  locked: z.boolean().optional(),
});
const saveSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(250),
  company_name: z.string().trim().max(200).nullable(),
  recipients: z.array(recipientSchema).max(3),
  address_form: z.enum(["plural", "male", "female"]),
  website: z.string().trim().max(300).nullable(),
  call_notes: z.string().max(10000),
  intro: z.string().max(20000),
  sections: z.array(sectionSchema).max(40),
  terms: z.string().max(20000),
  media_budget: z.number().min(0).nullable(),
  media_budgets: z.array(z.object({ id: z.string().max(60), platform: z.string().trim().max(80), amount: z.number().min(0).max(100_000_000) })).max(20).default([]),
  media_fee_percent: z.number().min(0).max(100).default(20),
  commitment_months: z.number().int().min(1).max(60),
  global_discount_percent: z.number().min(0).max(100),
  show_list_prices: z.boolean(),
  valid_until: z.string().nullable(),
  internal_notes: z.string().max(10000),
  items: z.array(itemSchema).max(60),
});

export type SavePayload = z.input<typeof saveSchema>;

export async function saveProposal(payload: SavePayload): Promise<ActionResult<{ status: string; warning?: string }>> {
  const parsed = saveSchema.safeParse(payload);
  if (!parsed.success) return fail("נתונים לא תקינים: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const d = parsed.data;
  const { supabase, user } = await requireMember();
  const { data: current } = await supabase.from("proposals").select("status").eq("id", d.id).single();
  if (!current) return fail("ההצעה לא נמצאה או שאין לך הרשאה");
  const status = current.status as Proposal["status"];
  if (["accepted", "rejected", "cancelled"].includes(status)) return fail("הצעה סגורה לא ניתנת לעריכה. ניתן לשכפל אותה.");

  // locked library sections keep their original text
  const { data: prev } = await supabase.from("proposals").select("sections").eq("id", d.id).single();
  const prevSections = ((prev?.sections ?? []) as Section[]).filter((s) => s.locked);
  const sections = d.sections.map((s) => {
    const orig = prevSections.find((p) => p.id === s.id);
    return orig ? { ...s, title: orig.title, body: orig.body, locked: true } : { ...s, locked: false };
  });

  const { items, id, ...fields } = d;
  // keep the single total in sync with the per-platform rows
  const mediaRows = fields.media_budgets.filter((m) => m.platform || m.amount);
  const media_budget = mediaRows.length ? mediaRows.reduce((a, m) => a + m.amount, 0) : fields.media_budget;
  const { error } = await supabase
    .from("proposals")
    .update({ ...fields, media_budgets: mediaRows, media_budget, sections, website: normalizeWebsite(fields.website ?? "") })
    .eq("id", id);
  if (error) return fail(error.message);

  const { error: delErr } = await supabase.from("proposal_items").delete().eq("proposal_id", id);
  if (delErr) return fail(delErr.message);
  if (items.length) {
    const { error: insErr } = await supabase
      .from("proposal_items")
      .insert(items.map((it, i) => ({ ...it, id: it.id && /^[0-9a-f-]{36}$/.test(it.id) ? it.id : undefined, proposal_id: id, sort: i })));
    if (insErr) return fail(insErr.message);
  }

  const { approval } = await recalcAndStore(supabase, id);

  // status rules after an edit (spec 7.3 FR-22, 10 FR-56)
  let newStatus = status;
  let warning: string | undefined;
  const approvedLevel = await lastApprovedLevel(supabase, id);
  const coveredByApproval = LEVEL_RANK[approval.level] <= LEVEL_RANK[approvedLevel];
  if (status === "pending_approval") {
    await supabase.from("approvals").update({ decision: "changes_requested", decision_note: "ההצעה נערכה אחרי בקשת האישור", decided_at: new Date().toISOString() }).eq("proposal_id", id).eq("decision", "pending");
    newStatus = "draft";
    warning = "ההצעה נערכה ולכן בקשת האישור בוטלה. יש לבקש אישור מחדש.";
  } else if (status === "approved" && !coveredByApproval) {
    newStatus = "draft";
    warning = "השינוי חורג ממה שאושר. יש לבקש אישור מחדש.";
  } else if (["sent", "viewed", "negotiation"].includes(status) && !coveredByApproval) {
    newStatus = "draft";
    warning = "השינוי דורש אישור. ההצעה הוסתרה מהלקוח עד לאישור ושליחה מחדש.";
  } else if (status === "changes_requested") {
    newStatus = "draft";
  }
  if (newStatus !== status) await supabase.from("proposals").update({ status: newStatus }).eq("id", id);
  await logEvent(supabase, id, "saved", user.id);
  revalidatePath(`/proposals/${id}`);
  return { ok: true, status: newStatus, warning };
}

// ---------- approvals ----------

export async function requestApproval(id: string, note: string): Promise<ActionResult<{ message: string; warning?: string }>> {
  const { supabase, user } = await requireMember();
  const { proposal, approval, pricing } = await recalcAndStore(supabase, id);
  if (approval.level === "none") return fail("ההצעה בתוך הספים ואינה דורשת אישור.");
  if (!["draft", "changes_requested", "approved", "sent", "viewed", "negotiation"].includes(proposal.status)) return fail("לא ניתן לבקש אישור בסטטוס הנוכחי.");
  const { error } = await supabase.from("approvals").insert({ proposal_id: id, level: approval.level, reasons: approval.reasons, request_note: note.slice(0, 2000), requested_by: user.id });
  if (error) return fail(error.message);
  await supabase.from("proposals").update({ status: "pending_approval" }).eq("id", id);
  await logEvent(supabase, id, "approval_requested", user.id, { level: approval.level });

  const { to, result } = await notifyApprovalRequested(supabase, await siteUrl(), { ...proposal, totals: pricing.totals }, approval.level, approval.reasons, note, user.id);
  revalidatePath(`/proposals/${id}`);
  if (result.ok) return { ok: true, message: `נשלח לאישור. הודעה נשלחה במייל אל ${to.join(", ")}.` };
  if (result.skipped && !emailConfigured())
    return { ok: true, message: "נשלח לאישור.", warning: "נשלח לאישור. שליחת מיילים עדיין לא הוגדרה, ולכן המאשר יראה את הבקשה רק בתוך המערכת." };
  return { ok: true, message: "נשלח לאישור.", warning: `נשלח לאישור, אבל שליחת המייל נכשלה (${result.error ?? "שגיאה"}). המאשר יראה את הבקשה בתוך המערכת.` };
}

export async function decideApproval(approvalId: string, decision: "approved" | "changes_requested", note: string): Promise<ActionResult> {
  const { supabase, user, profile } = await requireMember();
  const { data: a } = await supabase.from("approvals").select("*").eq("id", approvalId).single();
  if (!a || a.decision !== "pending") return fail("הבקשה לא נמצאה או שכבר טופלה");
  const level = a.level as ApprovalLevel;
  const allowed = profile.role === "admin" || (profile.role === "approver" && level === "manager");
  if (!allowed) return fail(level === "ceo" ? 'אישור ברמת מנכ"ל מותר למנהל מערכת בלבד' : "אין לך הרשאת אישור");
  const now = new Date().toISOString();
  const { error } = await supabase.from("approvals").update({ decision, decision_note: note.slice(0, 2000), decided_by: user.id, decided_at: now }).eq("id", approvalId);
  if (error) return fail(error.message);
  await supabase
    .from("proposals")
    .update(decision === "approved" ? { status: "approved", approved_at: now, approved_by: user.id } : { status: "changes_requested" })
    .eq("id", a.proposal_id);
  await logEvent(supabase, a.proposal_id as string, decision === "approved" ? "approved" : "changes_requested", user.id, { note });
  // tell the requester (skip when approving your own request)
  const { data: p } = await supabase.from("proposals").select("id, title, number, company_name, created_by, totals").eq("id", a.proposal_id).single();
  if (p && p.created_by !== user.id) await notifyApprovalDecided(supabase, await siteUrl(), p as Proposal, decision, note, user.id);
  revalidatePath(`/proposals/${a.proposal_id}`);
  return { ok: true };
}

// ---------- send ----------

export async function sendProposal(id: string): Promise<ActionResult<{ url: string }>> {
  const { supabase, user } = await requireMember();
  const b = await recalcAndStore(supabase, id);
  const { proposal, items, approval, pricing } = b;
  if (!items.length) return fail("אין שירותים בהצעה");
  if (["pending_approval", "accepted", "rejected", "cancelled"].includes(proposal.status)) return fail("לא ניתן לשלוח בסטטוס הנוכחי");
  if (approval.level !== "none" && LEVEL_RANK[approval.level] > LEVEL_RANK[await lastApprovedLevel(supabase, id)])
    return fail("ההצעה חורגת מהספים ודורשת אישור לפני שליחה");
  if (proposal.sections.some((s) => s.visible && s.source === "ai" && s.status !== "approved")) return fail("יש מקטעי AI שלא אושרו");

  const version = proposal.current_version + 1;
  const now = new Date().toISOString();
  await supabase.from("proposal_versions").insert({ proposal_id: id, version, snapshot: { proposal, items, totals: pricing.totals }, created_by: user.id });
  const resend = ["sent", "viewed", "negotiation"].includes(proposal.status);
  await supabase
    .from("proposals")
    .update({
      status: resend ? proposal.status : "sent",
      current_version: version,
      sent_at: proposal.sent_at ?? now,
      valid_until: proposal.valid_until ?? addDays(b.settings.default_validity_days),
    })
    .eq("id", id);
  await logEvent(supabase, id, resend ? "resent" : "sent", user.id, { version });
  revalidatePath(`/proposals/${id}`);
  return { ok: true, url: `${await siteUrl()}/p/${proposal.public_token}` };
}

// ---------- misc ----------

export async function duplicateProposal(id: string): Promise<ActionResult<{ id: string }>> {
  const { supabase, user } = await requireMember();
  const { proposal, items, settings } = await loadBundle(supabase, id);
  const { data: p, error } = await supabase
    .from("proposals")
    .insert({
      title: proposal.title,
      client_id: proposal.client_id,
      company_name: proposal.company_name,
      recipients: proposal.recipients,
      address_form: proposal.address_form,
      website: proposal.website,
      call_notes: proposal.call_notes,
      intro: proposal.intro,
      sections: proposal.sections,
      terms: proposal.terms,
      media_budget: proposal.media_budget,
      media_budgets: proposal.media_budgets,
      media_fee_percent: proposal.media_fee_percent,
      commitment_months: proposal.commitment_months,
      global_discount_percent: proposal.global_discount_percent,
      show_list_prices: proposal.show_list_prices,
      valid_until: addDays(settings.default_validity_days),
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !p) return fail(error?.message ?? "שגיאה");
  if (items.length)
    await supabase.from("proposal_items").insert(
      items.map((i) => {
        const { id: _drop, proposal_id: _p, ...rest } = i;
        void _drop;
        void _p;
        return { ...rest, proposal_id: p.id };
      }),
    );
  await recalcAndStore(supabase, p.id as string);
  await logEvent(supabase, p.id as string, "created", user.id, { duplicated_from: id });
  revalidatePath("/proposals");
  return { ok: true, id: p.id as string };
}

export async function setProposalStatus(id: string, status: "cancelled" | "rejected", reason = ""): Promise<ActionResult> {
  const { supabase, user } = await requireMember();
  const patch: Record<string, unknown> = { status };
  if (status === "rejected") Object.assign(patch, { rejected_at: new Date().toISOString(), rejection_reason: reason.slice(0, 1000) });
  const { error } = await supabase.from("proposals").update(patch).eq("id", id);
  if (error) return fail(error.message);
  await logEvent(supabase, id, status, user.id, { reason });
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function extendValidity(id: string, date: string): Promise<ActionResult> {
  const { supabase, user } = await requireMember();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail("תאריך לא תקין");
  const { error } = await supabase.from("proposals").update({ valid_until: date }).eq("id", id);
  if (error) return fail(error.message);
  await logEvent(supabase, id, "validity_extended", user.id, { date });
  revalidatePath(`/proposals/${id}`);
  return { ok: true };
}

export async function deleteProposal(id: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error, count } = await supabase.from("proposals").delete({ count: "exact" }).eq("id", id).eq("status", "draft");
  if (error) return fail(error.message);
  if (!count) return fail("ניתן למחוק רק טיוטות שיצרת");
  revalidatePath("/proposals");
  return { ok: true };
}
