import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emailHtml, sendEmail, type EmailResult } from "./email";
import { LEVEL_LABEL, type ApprovalLevel, type ApprovalReason } from "./pricing/approvals";
import { ils } from "./format";
import type { Proposal } from "./types";

type Db = SupabaseClient;
type P = Pick<Proposal, "id" | "title" | "number" | "company_name" | "created_by" | "totals">;

async function emailsOf(db: Db, filter: { roles?: string[]; ids?: string[] }): Promise<string[]> {
  let q = db.from("profiles").select("email, role, id").eq("active", true);
  if (filter.roles) q = q.in("role", filter.roles);
  if (filter.ids) q = q.in("id", filter.ids);
  const { data } = await q;
  return Array.from(new Set((data ?? []).map((p) => p.email as string).filter(Boolean)));
}

async function nameOf(db: Db, id: string | null | undefined): Promise<string> {
  if (!id) return "";
  const { data } = await db.from("profiles").select("full_name, email").eq("id", id).maybeSingle();
  return (data?.full_name as string) || (data?.email as string) || "";
}

const who = (p: P) => p.company_name || p.title;
const totalsLine = (p: P) =>
  p.totals ? `חודשי: ${ils(p.totals.monthlyNet)} · חד-פעמי: ${ils(p.totals.oneTimeNet)} · ערך התקשרות: ${ils(p.totals.contractValue)}` : "";

export async function notifyApprovalRequested(db: Db, base: string, p: P, level: ApprovalLevel, reasons: ApprovalReason[], note: string, requesterId: string): Promise<{ to: string[]; result: EmailResult }> {
  const roles = level === "ceo" ? ["admin"] : ["admin", "approver"];
  const to = await emailsOf(db, { roles });
  const requester = await nameOf(db, requesterId);
  const result = await sendEmail(
    to,
    `נדרש אישור ${LEVEL_LABEL[level]}: ${who(p)} (${p.number})`,
    emailHtml({
      title: `הצעה ממתינה לאישור ${LEVEL_LABEL[level]}`,
      lines: [
        `${requester} ביקש/ה אישור להצעה "${p.title}".`,
        totalsLine(p),
        "סיבות:\n" + reasons.map((r) => `• ${r.message}`).join("\n"),
        note ? `נימוק: ${note}` : "",
      ].filter(Boolean),
      buttonText: "לצפייה ואישור",
      buttonUrl: `${base}/proposals/${p.id}`,
    }),
  );
  return { to, result };
}

export async function notifyApprovalDecided(db: Db, base: string, p: P, decision: "approved" | "changes_requested", note: string, deciderId: string) {
  const to = await emailsOf(db, { ids: [p.created_by] });
  const decider = await nameOf(db, deciderId);
  const approved = decision === "approved";
  return sendEmail(
    to,
    `${approved ? "ההצעה אושרה" : "ההצעה הוחזרה לתיקון"}: ${who(p)} (${p.number})`,
    emailHtml({
      title: approved ? "ההצעה אושרה ✓" : "ההצעה הוחזרה לתיקון",
      lines: [`${decider} ${approved ? "אישר/ה" : "החזיר/ה לתיקון"} את ההצעה "${p.title}".`, note ? `הערה: ${note}` : "", approved ? "אפשר לשלוח אותה ללקוח." : ""].filter(Boolean),
      buttonText: "לפתיחת ההצעה",
      buttonUrl: `${base}/proposals/${p.id}`,
    }),
  );
}

export async function notifyClientEvent(db: Db, base: string, p: P, kind: "first_view" | "question" | "accepted", extra: { text?: string; signer?: string } = {}) {
  const owner = await emailsOf(db, { ids: [p.created_by] });
  const to = kind === "accepted" ? Array.from(new Set([...owner, ...(await emailsOf(db, { roles: ["admin"] }))])) : owner;
  const subject =
    kind === "first_view" ? `הלקוח פתח את ההצעה: ${who(p)}` : kind === "question" ? `שאלה מהלקוח: ${who(p)}` : `🎉 ההצעה נחתמה: ${who(p)}`;
  const lines =
    kind === "first_view"
      ? [`הלקוח פתח עכשיו את ההצעה "${p.title}" בפעם הראשונה. זה זמן טוב לפולואפ.`]
      : kind === "question"
        ? [`התקבלה שאלה על ההצעה "${p.title}":`, extra.text ?? ""]
        : [`ההצעה "${p.title}" אושרה ונחתמה על ידי ${extra.signer ?? "הלקוח"}.`, totalsLine(p)];
  return sendEmail(to, subject, emailHtml({ title: subject, lines: lines.filter(Boolean), buttonText: "לפתיחת ההצעה", buttonUrl: `${base}/proposals/${p.id}` }));
}
