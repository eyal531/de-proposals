import { z } from "zod";
import { aiConfigured, aiModel, complete } from "@/lib/ai/claude";
import { memberForApi } from "@/lib/ai/auth";

export const maxDuration = 60;

const PRESETS: Record<string, string> = {
  shorter: "קצר את הטקסט לכחצי מאורכו, בלי לאבד את הנקודות החשובות.",
  longer: "הרחב את הטקסט עם פרטים ודוגמאות קונקרטיות, בלי להמציא נתונים.",
  professional: "נסח בטון מקצועי ורשמי יותר.",
  warmer: "נסח בטון חם, אישי וקרוב יותר.",
  direct: "נסח בצורה ישירה ותכליתית יותר, משפטים קצרים.",
};

const body = z.object({
  title: z.string().max(200),
  text: z.string().min(1).max(20000),
  preset: z.enum(["shorter", "longer", "professional", "warmer", "direct", "custom"]),
  instruction: z.string().max(1000).optional().default(""),
  addressForm: z.enum(["plural", "male", "female"]),
});

const VOICE = { plural: "לשון רבים", male: "לשון זכר יחיד", female: "לשון נקבה יחידה" };

export async function POST(req: Request) {
  if (!aiConfigured()) return Response.json({ error: "AI עדיין לא הוגדר" }, { status: 503 });
  const auth = await memberForApi();
  if ("error" in auth) return auth.error;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "בקשה לא תקינה" }, { status: 400 });
  const d = parsed.data;
  const instruction = d.preset === "custom" ? d.instruction : PRESETS[d.preset];
  if (!instruction.trim()) return Response.json({ error: "כתבו מה לשנות" }, { status: 400 });

  try {
    const { text } = await complete(
      aiModel(auth.settings.ai_model),
      `אתה עורך תוכן בעברית בסוכנות דיגיטל אפקטיב. אתה משכתב מקטע בהצעת מחיר ללקוח.
החזר רק את הטקסט המשוכתב, בלי הקדמות, בלי מרכאות ובלי כותרת. שמור על אותו מבנה שורות (תבליטים • ✓ ומספור).
פנה ללקוח ב${VOICE[d.addressForm]}. אל תמציא מספרים או עובדות שלא מופיעים בטקסט.
${auth.settings.ai_guidelines ? `הנחיות סגנון: ${auth.settings.ai_guidelines}` : ""}`,
      `כותרת המקטע: ${d.title}\n\nהטקסט:\n${d.text}\n\nהבקשה: ${instruction}`,
    );
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "שגיאה" }, { status: 502 });
  }
}
