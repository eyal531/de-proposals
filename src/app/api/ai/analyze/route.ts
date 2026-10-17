import { z } from "zod";
import { aiConfigured, aiModel, runStructured } from "@/lib/ai/claude";
import { buildPrompt, buildSystem, SUBMIT_TOOL, toSections, WEB_SEARCH_TOOL, type AnalysisResult } from "@/lib/ai/analyze";
import { fetchSite } from "@/lib/ai/site";
import { memberForApi } from "@/lib/ai/auth";
import { normalizeWebsite } from "@/lib/email-domain";

export const maxDuration = 300;

const body = z.object({
  proposalId: z.string().uuid(),
  companyName: z.string().max(200).nullable(),
  website: z.string().max(300).nullable(),
  callNotes: z.string().max(10000),
  addressForm: z.enum(["plural", "male", "female"]),
  serviceIds: z.array(z.string().uuid()).max(40),
  serviceNames: z.array(z.string().max(200)).max(40),
});

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "ניתוח AI עדיין לא הוגדר: חסר ANTHROPIC_API_KEY ב-Vercel" }, { status: 503 });
  const auth = await memberForApi();
  if ("error" in auth) return auth.error;
  const { supabase, user, settings } = auth;

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const d = parsed.data;

  // the employee must be allowed to read this proposal (RLS)
  const { data: proposal } = await supabase.from("proposals").select("id").eq("id", d.proposalId).maybeSingle();
  if (!proposal) return Response.json({ error: "ההצעה לא נמצאה" }, { status: 404 });

  const website = normalizeWebsite(d.website ?? "");
  if (!website && !d.callNotes.trim() && !d.companyName) return Response.json({ error: "צריך לפחות אתר, שם חברה או הערות מהשיחה כדי לנתח" }, { status: 400 });

  const { data: services } = d.serviceIds.length ? await supabase.from("services").select("id, name, ai_profile").in("id", d.serviceIds) : { data: [] };
  const svc = [
    ...(services ?? []).map((s) => ({ name: s.name as string, profile: (s.ai_profile as string | null) ?? null })),
    ...d.serviceNames.filter((n) => !(services ?? []).some((s) => s.name === n)).map((name) => ({ name, profile: null })),
  ];

  const started = Date.now();
  try {
    const site = website ? await fetchSite(website) : null;
    const { result, usage, urls } = await runStructured<AnalysisResult>({
      model: aiModel(settings.ai_model),
      system: buildSystem(settings.ai_guidelines),
      prompt: buildPrompt({ companyName: d.companyName, website, callNotes: d.callNotes, services: svc, addressForm: d.addressForm, guidelines: settings.ai_guidelines, site }),
      submitTool: SUBMIT_TOOL,
      webSearch: WEB_SEARCH_TOOL,
      maxTokens: 5000,
    });
    const sources = Array.from(new Set([...(site?.pages.map((p) => p.url) ?? []), ...urls])).slice(0, 30);
    const sections = toSections(result, sources, () => crypto.randomUUID());
    await supabase.from("proposal_events").insert({
      proposal_id: d.proposalId,
      type: "ai_analysis",
      actor: user.id,
      meta: { ...usage, seconds: Math.round((Date.now() - started) / 1000), pages: site?.pages.length ?? 0, site_ok: site?.ok ?? null },
    });
    return Response.json({
      sections,
      notes: result.internal_notes ?? [],
      siteError: site && !site.ok ? site.error : null,
      pagesRead: site?.pages.length ?? 0,
      usage,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "שגיאה בניתוח" }, { status: 502 });
  }
}
