import Link from "next/link";
import { requireMember } from "@/lib/data";
import { dateHe, ils, isExpired } from "@/lib/format";
import { STATUS_COLOR, STATUS_LABEL, type Proposal, type ProposalStatus } from "@/lib/types";

const FILTERS: { key: string; label: string; statuses: ProposalStatus[] | null }[] = [
  { key: "open", label: "פתוחות", statuses: ["draft", "pending_approval", "changes_requested", "approved", "sent", "viewed", "negotiation"] },
  { key: "approval", label: "ממתינות לאישור", statuses: ["pending_approval"] },
  { key: "sent", label: "נשלחו", statuses: ["sent", "viewed", "negotiation"] },
  { key: "won", label: "נחתמו", statuses: ["accepted"] },
  { key: "closed", label: "נדחו / בוטלו / פגו", statuses: ["rejected", "cancelled", "expired"] },
  { key: "all", label: "הכל", statuses: null },
];

type Row = Pick<Proposal, "id" | "number" | "title" | "status" | "company_name" | "recipients" | "totals" | "valid_until" | "updated_at" | "view_count" | "created_by">;

export default async function ProposalsPage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f = "open", q = "" } = await searchParams;
  const { supabase, profile } = await requireMember();
  const filter = FILTERS.find((x) => x.key === f) ?? FILTERS[0];

  let query = supabase
    .from("proposals")
    .select("id, number, title, status, company_name, recipients, totals, valid_until, updated_at, view_count, created_by")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (filter.statuses) query = query.in("status", filter.statuses);
  const term = q.replace(/[,()%*\\]/g, " ").trim();
  if (term) query = query.or(`title.ilike.%${term}%,company_name.ilike.%${term}%,number.ilike.%${term}%`);
  const { data } = await query;
  const rows = (data ?? []) as Row[];

  const { data: people } = await supabase.from("profiles").select("id, full_name, email");
  const nameOf = new Map((people ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));

  const { count: pendingForMe } =
    profile.role === "admin" || profile.role === "approver"
      ? await supabase.from("proposals").select("id", { count: "exact", head: true }).eq("status", "pending_approval")
      : { count: 0 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">הצעות מחיר</h1>
        <Link href="/proposals/new" className="btn btn-primary ms-auto">
          + הצעה חדשה
        </Link>
      </div>

      {!!pendingForMe && (
        <Link href="/proposals?f=approval" className="card block border-amber-200 bg-amber-50 py-3 text-sm">
          {pendingForMe} הצעות ממתינות לאישור שלך
        </Link>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/proposals?f=${x.key}`} className={`btn btn-sm ${x.key === filter.key ? "btn-primary" : ""}`}>
            {x.label}
          </Link>
        ))}
        <form className="ms-auto">
          <input type="hidden" name="f" value={filter.key} />
          <input name="q" defaultValue={q} placeholder="חיפוש לפי לקוח, כותרת או מספר" className="input w-64" />
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="grid">
          <thead>
            <tr>
              <th>מס&apos;</th>
              <th>הצעה</th>
              <th>סטטוס</th>
              <th>חודשי</th>
              <th>חד-פעמי</th>
              <th>תוקף</th>
              <th>צפיות</th>
              <th>מכין</th>
              <th>עודכן</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const expired = isExpired(r.valid_until) && ["sent", "viewed", "negotiation"].includes(r.status);
              return (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="num text-muted">{r.number}</td>
                  <td>
                    <Link href={`/proposals/${r.id}`} className="font-medium text-brand hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-xs text-muted">{r.company_name || r.recipients?.[0]?.name || "—"}</div>
                  </td>
                  <td>
                    <span className={`badge ${expired ? "badge-gray" : STATUS_COLOR[r.status]}`}>{expired ? "פג תוקף" : STATUS_LABEL[r.status]}</span>
                  </td>
                  <td className="num">{r.totals ? ils(r.totals.monthlyNet) : "—"}</td>
                  <td className="num">{r.totals ? ils(r.totals.oneTimeNet) : "—"}</td>
                  <td>{dateHe(r.valid_until)}</td>
                  <td className="num">{r.view_count || "—"}</td>
                  <td className="text-sm">{nameOf.get(r.created_by) ?? "—"}</td>
                  <td className="text-sm text-muted">{dateHe(r.updated_at)}</td>
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={9} className="py-10 text-center text-muted">
                  אין הצעות להצגה
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
