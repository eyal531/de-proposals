import { getSettings, requireMember } from "@/lib/data";
import type { Service } from "@/lib/types";
import { NewProposalForm } from "./NewProposalForm";

export default async function NewProposalPage() {
  const { supabase } = await requireMember();
  const [{ data: services }, settings] = await Promise.all([
    supabase.from("services").select("*").eq("active", true).order("sort"),
    getSettings(supabase),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">הצעה חדשה</h1>
      <NewProposalForm services={(services ?? []) as Service[]} freeDomains={settings.free_email_domains} />
    </div>
  );
}
