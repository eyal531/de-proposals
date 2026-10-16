import { redirect } from "next/navigation";
import { getSettings, requireMember } from "@/lib/data";
import type { Profile } from "@/lib/types";
import { SettingsForm } from "./SettingsForm";

export default async function SettingsPage() {
  const { supabase, profile } = await requireMember();
  if (profile.role !== "admin") redirect("/proposals");
  const [settings, { data: users }] = await Promise.all([getSettings(supabase), supabase.from("profiles").select("*").order("created_at")]);
  return <SettingsForm settings={settings} users={(users ?? []) as Profile[]} me={profile.id} />;
}
