// Business analysis for a proposal (spec 9.4): prompt, structured output schema, and conversion to proposal sections.
import type { AddressForm } from "../greeting";
import type { Section } from "../types";
import type { SiteScan } from "./site";
import { signalsSummary } from "./site";

export interface AnalysisInput {
  companyName: string | null;
  website: string | null;
  callNotes: string;
  services: { name: string; profile: string | null }[];
  addressForm: AddressForm;
  guidelines: string;
  site: SiteScan | null;
}

export interface AnalysisResult {
  business_summary: string;
  challenges: string[];
  opportunities: string[];
  competitors: { name: string; url?: string; note: string }[];
  competition_summary: string;
  strategy: string;
  first_steps: string[];
  extra_sections: { key: string; title: string; body: string }[];
  internal_notes: string[];
}

// Short by design (the proposal is a sales document, not a report). Staff can expand a section with "הרחב".
export const SUBMIT_TOOL = {
  name: "submit_analysis",
  description: "Submit the final business analysis for the proposal. All text in Hebrew, short.",
  input_schema: {
    type: "object",
    properties: {
      business_summary: { type: "string", description: "עד 2 משפטים: מה העסק עושה, למי, ומה הבידול" },
      challenges: { type: "array", items: { type: "string" }, maxItems: 3, description: "בדיוק 3 אתגרים, משפט אחד קצר לכל אחד (עד 15 מילים), מבוססים על מה שראית באתר ובשיחה" },
      opportunities: { type: "array", items: { type: "string" }, maxItems: 3, description: "בדיוק 3 הזדמנויות, משפט אחד קצר לכל אחת (עד 15 מילים)" },
      competitors: {
        type: "array",
        maxItems: 3,
        description: "עד 3 מתחרים שמצאת בחיפוש",
        items: {
          type: "object",
          properties: { name: { type: "string" }, url: { type: "string" }, note: { type: "string", description: "משפט אחד: מה הם עושים טוב ואיפה הפער שלנו מולם" } },
          required: ["name", "note"],
        },
      },
      competition_summary: { type: "string", description: "משפט אחד על תמונת התחרות" },
      strategy: { type: "string", description: "פסקה אחת, עד 60 מילים: איך הערוצים שבהצעה עובדים יחד" },
      first_steps: { type: "array", items: { type: "string" }, maxItems: 4, description: "3–4 צעדים ראשונים, עד 10 מילים לכל צעד" },
      extra_sections: {
        type: "array",
        description: "מקטעים נוספים לפי השירותים, כל אחד עד 4 שורות קצרות",
        items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, required: ["key", "title", "body"] },
      },
      internal_notes: { type: "array", items: { type: "string" }, maxItems: 4, description: "עד 4 הערות פנימיות קצרות למכין ההצעה: מה לא בטוח, מה לבדוק. לא מוצג ללקוח" },
    },
    required: ["business_summary", "challenges", "opportunities", "competitors", "competition_summary", "strategy", "first_steps", "extra_sections", "internal_notes"],
  },
};

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 3,
  // no user_location: the API does not accept IL as a country; the prompt asks for Hebrew queries about Israel instead
};

const VOICE: Record<AddressForm, string> = {
  plural: "פנה ללקוח בלשון רבים (אתכם, שלכם, תוכלו).",
  male: "פנה ללקוח בלשון זכר יחיד (אתה, שלך, תוכל).",
  female: "פנה ללקוח בלשון נקבה יחידה (את, שלך, תוכלי).",
};

const PROFILE_EXTRAS: Record<string, string> = {
  seo: 'key="seo_topics", כותרת "נושאי החיפוש שנתמקד בהם": 3 נושאים עם 2 ביטויים לדוגמה לכל אחד. בלי נפחי חיפוש.',
  website: 'key="site_improvements", כותרת "מה נשפר באתר": 4 נקודות לפי מה שראית באתר.',
  landing: 'key="landing_focus", כותרת "על מה יתמקד עמוד הנחיתה": מסר מרכזי, הוכחת אמון והנעה לפעולה, שורה לכל אחד.',
  cro: 'key="cro_hypotheses", כותרת "השערות לשיפור ההמרות": 3 השערות.',
  dashboard: 'key="kpis", כותרת "המדדים שנעקוב אחריהם": 4–5 מדדים.',
  social: 'key="content_pillars", כותרת "עמודי התוכן": 3 עמודי תוכן, שורה לכל אחד.',
  media_social: 'key="audiences", כותרת "קהלים וזוויות קריאייטיב": 2–3 קהלים ו-2 זוויות, שורה לכל אחד.',
  media_google: 'key="campaign_structure", כותרת "מבנה הקמפיינים בגוגל": 3–4 קבוצות מודעות. בלי עלויות ונפחי חיפוש.',
  consulting: 'key="first_meetings", כותרת "על מה נעבוד בפגישות הראשונות": 3 נושאים.',
};

export function buildSystem(guidelines: string) {
  return `אתה אסטרטג שיווק דיגיטלי בכיר בסוכנות "דיגיטל אפקטיב" בישראל, שכותב את חלק הניתוח בהצעת מחיר ללקוח פוטנציאלי.

עקרונות מחייבים:
- כתוב בעברית עסקית טבעית, ברורה וקונקרטית. לא תרגומית, בלי סלנג ובלי מילים באנגלית כשיש מילה עברית מקובלת.
- קצר ותמציתי: זו הצעת מחיר, לא דוח. משפטים קצרים, בלי הקדמות, בלי חזרות ובלי מילות מילוי. עמוד בדיוק במגבלות האורך שבסכמה.
- ספציפי ולא כללי: אתגר טוב הוא "אין פיקסל מטא באתר, ולכן אי אפשר לפנות שוב למבקרים". אסור לכתוב: "יש מקום לשפר את הנוכחות הדיגיטלית".
- אל תמציא נתונים. אין לך נתוני תנועה, נפחי חיפוש, עלויות קליק או מחזורים – אל תכתוב מספרים כאלה. השתמש רק במה שמופיע באתר, בממצאים הטכניים, בהערות מהשיחה ובתוצאות החיפוש.
- מתחרים: תיאור עובדתי ומכבד בלבד, בלי השמצה ובלי טענות שלא ראית.
- כשאתה לא בטוח במשהו, אל תכתוב אותו בטקסט ללקוח – רשום אותו ב-internal_notes.
- הטון בטוח ומקצועי, משדר שאנחנו כבר מכירים את העסק ומוכנים להתחיל.
${guidelines ? `\nהנחיות סגנון של הסוכנות:\n${guidelines}\n` : ""}
בסוף העבודה קרא לכלי submit_analysis עם התוצאה.`;
}

export function buildPrompt(i: AnalysisInput) {
  const parts: string[] = [];
  parts.push(`הלקוח: ${i.companyName || "(שם החברה לא ידוע)"}${i.website ? `\nאתר: ${i.website}` : ""}`);
  parts.push(`השירותים בהצעה: ${i.services.map((s) => s.name).join(", ") || "לא צוינו"}`);
  parts.push(VOICE[i.addressForm]);
  if (i.callNotes.trim()) parts.push(`הערות מהשיחה עם הלקוח (המידע החשוב ביותר):\n${i.callNotes.trim()}`);

  if (i.site?.ok) {
    parts.push(`ממצאים טכניים שנבדקו אוטומטית באתר (עובדות):\n${signalsSummary(i.site.signals!).map((s) => `- ${s}`).join("\n")}`);
    const pages = i.site.pages
      .map((p) => `### ${p.url}\nכותרת: ${p.title}\nתיאור: ${p.description}\n${p.headings.join("\n")}\nטקסט: ${p.text}`)
      .join("\n\n");
    parts.push(`תוכן העמודים שנסרקו מהאתר:\n${pages}`);
  } else if (i.website) {
    parts.push(`לא הצלחנו לקרוא את האתר (${i.site?.error ?? "שגיאה"}). אפשר לחפש עליו ברשת, ואם לא נמצא מידע – הסתמך על הערות השיחה וכתוב ממצאים זהירים.`);
  }

  const extras = Array.from(new Set(i.services.map((s) => s.profile).filter(Boolean) as string[]))
    .map((p) => PROFILE_EXTRAS[p])
    .filter(Boolean);
  if (extras.length) parts.push(`מקטעים נוספים ב-extra_sections (קצרים):\n${extras.map((e) => `- ${e}`).join("\n")}`);
  else parts.push("אין צורך במקטעים נוספים (extra_sections ריק).");

  parts.push(
    "משימה: חפש ברשת עד 3 מתחרים רלוונטיים בישראל באותו תחום ואזור, ואז כתוב ניתוח קצר. נסח את שאילתות החיפוש בעברית וכלול בהן את העיר או האזור בישראל. לכל היותר 2–3 חיפושים.",
  );
  return parts.join("\n\n");
}

const bullets = (arr: string[]) => arr.filter(Boolean).map((s) => `• ${s.trim()}`).join("\n");
const numbered = (arr: string[]) => arr.filter(Boolean).map((s, n) => `${n + 1}. ${s.trim()}`).join("\n");

/** Converts the model output into proposal sections (all drafts, keyed so a re-run replaces them). */
export function toSections(r: AnalysisResult, sources: string[], newId: () => string): Section[] {
  const s = (aiKey: string, title: string, body: string): Section | null =>
    body.trim() ? { id: newId(), aiKey, title, body: body.trim(), visible: true, source: "ai", status: "draft", sources } : null;
  const ch = (r.challenges ?? []).slice(0, 3);
  const op = (r.opportunities ?? []).slice(0, 3);
  const challengesOpps = [ch.length ? `האתגרים:\n${bullets(ch)}` : "", op.length ? `ההזדמנויות:\n${bullets(op)}` : ""].filter(Boolean).join("\n\n");
  const comp = [r.competition_summary ?? "", (r.competitors ?? []).slice(0, 3).map((c) => `• ${c.name}: ${c.note}`).join("\n")].filter((x) => x.trim()).join("\n\n");
  return [
    s("business", "כך הבנו את העסק שלכם", r.business_summary ?? ""),
    s("challenges", "אתגרים והזדמנויות", challengesOpps),
    s("competition", "תמונת התחרות", comp),
    s("strategy", "האסטרטגיה המוצעת", r.strategy ?? ""),
    ...(r.extra_sections ?? []).map((e) => s(`extra:${e.key}`, e.title, e.body)),
    s("first30", "הצעדים הראשונים", numbered((r.first_steps ?? []).slice(0, 4))),
  ].filter(Boolean) as Section[];
}

/** A re-run replaces all earlier analysis sections (any aiKey) and puts the new ones before library/manual sections. */
export function mergeSections(existing: Section[], fresh: Section[]): Section[] {
  const kept = existing.filter((e) => !(e.source === "ai" && e.aiKey));
  const keptAi = kept.filter((e) => e.source === "ai");
  const rest = kept.filter((e) => e.source !== "ai");
  return [...fresh, ...keptAi, ...rest];
}
