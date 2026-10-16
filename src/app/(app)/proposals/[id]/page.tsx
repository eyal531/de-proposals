import { notFound } from "next/navigation";
import { getSettings, requireMember, siteUrl } from "@/lib/data";
import type { Approval, Proposal, ProposalEvent, ProposalItem, Service } from "@/lib/types";
import { ProposalEditor } from "./ProposalEditor";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireMember();
  const { data: proposal } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle();
  if (!proposal) notFound();

  const [{ data: items }, { data: services }, settings, { data: approvals }, { data: events }, { data: people }] = await Promise.all([
    supabase.from("proposal_items").select("*").eq("proposal_id", id).order("sort"),
    supabase.from("services").select("*").order("sort"),
    getSettings(supabase),
    supabase.from("approvals").select("*").eq("proposal_id", id).order("created_at", { ascending: false }),
    supabase.from("proposal_events").select("*").eq("proposal_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id as string, (p.full_name as string) || (p.email as string)]));

  return (
    <ProposalEditor
      key={(proposal as Proposal).updated_at}
      proposal={proposal as Proposal}
      items={(items ?? []) as ProposalItem[]}
      services={(services ?? []) as Service[]}
      settings={settings}
      approvals={(approvals ?? []) as Approval[]}
      events={(events ?? []) as ProposalEvent[]}
      role={profile.role}
      names={names}
      siteUrl={await siteUrl()}
    />
  );
}
