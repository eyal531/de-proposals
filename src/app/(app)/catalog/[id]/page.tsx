import { notFound, redirect } from "next/navigation";
import { requireMember } from "@/lib/data";
import type { Service } from "@/lib/types";
import { ServiceForm } from "../ServiceForm";

export default async function ServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireMember();
  if (profile.role !== "admin") redirect("/catalog");
  const { data: cats } = await supabase.from("services").select("category");
  const categories = Array.from(new Set((cats ?? []).map((c) => c.category as string)));
  if (id === "new") return <ServiceForm categories={categories} />;
  const { data } = await supabase.from("services").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const { data: history } = await supabase.from("service_price_history").select("*").eq("service_id", id).order("changed_at", { ascending: false }).limit(20);
  return <ServiceForm service={data as Service} categories={categories} history={history ?? []} />;
}
