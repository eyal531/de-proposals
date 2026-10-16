import { NextResponse } from "next/server";
import { z } from "zod";
import { loadByToken } from "@/lib/public-data";
import { LIVE_STATUSES } from "@/lib/types";
import { notifyClientEvent } from "@/lib/notify";

const body = z.object({ text: z.string().trim().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const data = await loadByToken(token);
  if (!data || !LIVE_STATUSES.includes(data.proposal.status)) return NextResponse.json({ error: "not found" }, { status: 404 });
  await data.db.from("proposal_events").insert({ proposal_id: data.proposal.id, type: "question", meta: { text: parsed.data.text } });
  if (data.proposal.status === "viewed" || data.proposal.status === "sent")
    await data.db.from("proposals").update({ status: "negotiation" }).eq("id", data.proposal.id);
  await notifyClientEvent(data.db, new URL(req.url).origin, data.proposal, "question", { text: parsed.data.text });
  return NextResponse.json({ ok: true });
}
