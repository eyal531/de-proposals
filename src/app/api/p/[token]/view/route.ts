import { NextResponse } from "next/server";
import { loadByToken } from "@/lib/public-data";
import { LIVE_STATUSES } from "@/lib/types";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadByToken(token);
  if (!data || !LIVE_STATUSES.includes(data.proposal.status)) return NextResponse.json({ ok: false }, { status: 404 });
  const { db, proposal } = data;
  const now = new Date().toISOString();
  await db
    .from("proposals")
    .update({
      view_count: (proposal.view_count ?? 0) + 1,
      first_viewed_at: proposal.first_viewed_at ?? now,
      last_viewed_at: now,
      ...(proposal.status === "sent" ? { status: "viewed" } : {}),
    })
    .eq("id", proposal.id);
  const ua = req.headers.get("user-agent") ?? "";
  await db.from("proposal_events").insert({ proposal_id: proposal.id, type: "viewed", meta: { mobile: /Mobi|Android|iPhone/i.test(ua), ua: ua.slice(0, 300) } });
  return NextResponse.json({ ok: true });
}
