import "server-only";
import { createClient } from "../supabase/server";
import { getSettings } from "../data";
import type { Profile } from "../types";

/** For AI route handlers: returns the signed-in team member or a JSON error response. */
export async function memberForApi() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: Response.json({ error: "יש להתחבר מחדש" }, { status: 401 }) } as const;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  const profile = data as Profile | null;
  if (!profile?.active || profile.role === "viewer") return { error: Response.json({ error: "אין הרשאה" }, { status: 403 }) } as const;
  const settings = await getSettings(supabase);
  return { supabase, user, profile, settings } as const;
}
