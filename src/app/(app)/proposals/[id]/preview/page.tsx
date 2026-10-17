import { notFound } from "next/navigation";
import { getSettings, requireMember } from "@/lib/data";
import { toPublic } from "@/lib/public-proposal";
import type { Proposal, ProposalItem } from "@/lib/types";
import { ProposalDocument } from "@/components/proposal/ProposalDocument";

export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireMember();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!proposal) notFound();
  const [{ data: items }, settings] = await Promise.all([supabase.from("proposal_items").select("*").eq("proposal_id", id).order("sort"), getSettings(supabase)]);
  const pub = toPublic(proposal as Proposal, (items ?? []) as ProposalItem[]);
  return (
    <div>
      <div className="no-print rounded-lg bg-amber-50 p-2 text-center text-sm">תצוגה מקדימה – כך הלקוח יראה את ההצעה (לפי הגרסה השמורה). בחירות כאן לא נשמרות.</div>
      <ProposalDocument proposal={pub.proposal} items={pub.items} brand={settings.brand} vatRate={settings.vat_rate} rounding={settings.rounding} mode="preview" interactive />
    </div>
  );
}
