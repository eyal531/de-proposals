import { NextResponse } from "next/server";
import { z } from "zod";
import { loadByToken } from "@/lib/public-data";
import { OPEN_STATUSES } from "@/lib/types";
import { applySelection } from "@/lib/pricing/engine";
import { calcProposal } from "@/lib/proposal-calc";
import { isExpired } from "@/lib/format";

const body = z.object({ itemId: z.string().uuid(), selected: z.boolean() });

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad request" }, { status: 400 });
  const data = await loadByToken(token);
  if (!data || !OPEN_STATUSES.includes(data.proposal.status) || isExpired(data.proposal.valid_until)) return NextResponse.json({ error: "ההצעה אינה פתוחה לשינויים" }, { status: 409 });

  const { db, proposal, items, settings } = data;
  const target = items.find((i) => i.id === parsed.data.itemId);
  if (!target || target.kind === "required") return NextResponse.json({ error: "פריט לא ניתן לשינוי" }, { status: 400 });

  // reuse the engine's selection rule (alternatives are exclusive within a group)
  const asInputs = items.map((i) => ({ id: i.id, name: i.name, model: i.pricing_model, params: i.params, kind: i.kind, groupKey: i.group_key, selected: i.selected }));
  const next = applySelection(asInputs, target.id, parsed.data.selected);
  const changed = next.filter((n) => items.find((i) => i.id === n.id)!.selected !== n.selected);
  for (const c of changed) await db.from("proposal_items").update({ selected: c.selected }).eq("id", c.id);

  const updatedItems = items.map((i) => ({ ...i, selected: next.find((n) => n.id === i.id)!.selected }));
  const { data: services } = await db.from("services").select("*");
  const { pricing } = calcProposal(proposal, updatedItems, services ?? [], settings);
  await db.from("proposals").update({ totals: pricing.totals }).eq("id", proposal.id);
  await db.from("proposal_events").insert({ proposal_id: proposal.id, type: "selection", meta: { item: target.name, selected: parsed.data.selected } });
  return NextResponse.json({ ok: true, totals: pricing.totals });
}
