import { NextResponse } from "next/server";
import { z } from "zod";
import { clientIp, loadByToken } from "@/lib/public-data";
import { OPEN_STATUSES } from "@/lib/types";
import { calcProposal } from "@/lib/proposal-calc";
import { isExpired } from "@/lib/format";

const body = z.object({
  name: z.string().trim().min(2).max(120),
  role: z.string().trim().max(120).optional().default(""),
  agree: z.literal(true),
  // drawn signature as a PNG data URL (kept small)
  signature: z.string().startsWith("data:image/png;base64,").max(400_000),
});

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "יש למלא שם, לחתום ולסמן את האישור" }, { status: 400 });
  const data = await loadByToken(token);
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { db, proposal, items, settings } = data;
  if (!OPEN_STATUSES.includes(proposal.status) || isExpired(proposal.valid_until)) return NextResponse.json({ error: "ההצעה אינה פתוחה לאישור" }, { status: 409 });

  const now = new Date().toISOString();
  const { data: services } = await db.from("services").select("*");
  const { pricing } = calcProposal(proposal, items, services ?? [], settings);
  const signer = { name: parsed.data.name, role: parsed.data.role, signature: parsed.data.signature, ip: clientIp(req), user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300), at: now };

  // conditional update so a double click can't sign twice
  const { data: updated, error } = await db
    .from("proposals")
    .update({ status: "accepted", accepted_at: now, signer, totals: pricing.totals })
    .eq("id", proposal.id)
    .in("status", OPEN_STATUSES)
    .select("id");
  if (error || !updated?.length) return NextResponse.json({ error: "לא ניתן לאשר כרגע" }, { status: 409 });

  await db.from("proposal_versions").insert({
    proposal_id: proposal.id,
    version: proposal.current_version + 1,
    snapshot: { proposal: { ...proposal, status: "accepted", signer: { ...signer, signature: "[stored on proposal]" } }, items, totals: pricing.totals, accepted: true },
  });
  await db.from("proposals").update({ current_version: proposal.current_version + 1 }).eq("id", proposal.id);
  await db.from("proposal_events").insert({ proposal_id: proposal.id, type: "accepted", meta: { name: signer.name, role: signer.role, ip: signer.ip } });
  return NextResponse.json({ ok: true });
}
