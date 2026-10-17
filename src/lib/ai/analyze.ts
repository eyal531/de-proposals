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
  site_findings: { finding: string; kind: "strength" | "improve" }[];
  challenges: string[];
  competitors: { name: string; url?: string; strengths: string; gap: string }[];
  competition_summary: string;
  opportunities: string[];
  strategy: string;
  first_30_days: string[];
  extra_sections: { key: string; title: string; body: string }[];
  internal_notes: string[];
}

export const SUBMIT_TOOL = {
  name: "submit_analysis",
  description: "Submit the final business analysis for the proposal. All text in Hebrew.",
  input_schema: {
    type: "object",
    properties: {
      business_summary: { type: "string", description: "פסקה אחת: מה העסק עושה, למי, ומה הבידול" },
      site_findings: {
        type: "array",
        description: "4–6 ממצאים ספציפיים ובדוקים מהאתר",
        items: { type: "object", properties: { finding: { type: "string" }, kind: { type: "string", enum: ["strength", "improve"] } }, required: ["finding", "kind"] },
      },
      challenges: { type: "array", items: { type: "string" }, description: "3–5 אתגרים שיווקיים" },
      competitors: {
        type: "array",
        description: "3–5 מתחרים שמופיעים בחיפוש בגוגל בישראל",
        items: {
          type: "object",
          properties: { name: { type: "string" }, url: { type: "string" }, strengths: { type: "string" }, gap: { type: "string", description: "איפה יש פער/הזדמנות מולו" } },
          required: ["name", "strengths", "gap"],
        },
      },
      competition_summary: { type: "string", description: "2–3 משפטים על תמונת התחרות" },
      opportunities: { type: "array", items: { type: "string" }, description: "3–5 הזדמנויות צמיחה" },
      strategy: { type: "string", description: "2–4 פסקאות: האסטרטגיה לפי הערוצים שבהצעה ואיך הם עובדים יחד" },
      first_30_days: { type: "array", items: { type: "string" }, description: "5–7 צעדים מעשיים לחודש הראשון" },
      extra_sections: {
        type: "array",
        description: "מקטעים נוספים לפי השירותים (למשל נושאי חיפוש ל-SEO, מה נשפר באתר)",
        items: { type: "object", properties: { key: { type: "string" }, title: { type: "string" }, body: { type: "string" } }, required: ["key", "title", "body"] },
      },
      internal_notes: { type: "array", items: { type: "string" }, description: "הערות פנימיות למכין ההצעה: מה לא בטוח, מה כדאי לבדוק. לא מוצג ללקוח" },
    },
    required: ["business_summary", "site_findings", "challenges", "competitors", "competition_summary", "opportunities", "strategy", "first_30_days", "extra_sections", "internal_notes"],
  },
};

export const WEB_SEARCH_TOOL = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 5,
  // no user_location: the API does not accept IL as a country; the prompt asks for Hebrew queries about Israel instead
};

const VOICE: Record<AddressForm, string> = {
  plural: "פנה ללקוח בלשון רבים (אתכם, שלכם, תוכלו).",
  male: "פנה ללקוח בלשון זכר יחיד (אתה, שלך, תוכל).",
  female: "פנה ללקוח בלשון נקבה יחידה (את, שלך, תוכלי).",
};

const PROFILE_EXTRAS: Record<string, string> = {
  seo: 'הוסף ב-extra_sections מקטע key="seo_topics" בשם "נושאי החיפוש שנתמקד בהם": 3–5 קבוצות נושאים עם דוגמאות לביטויים בעברית. אל תכתוב נפחי חיפוש, עלויות או מיקומים – אין לך נתונים כאלה.',
  website: 'הוסף ב-extra_sections מקטע key="site_improvements" בשם "מה נשפר באתר": 4–6 נקודות מבוססות על מה שראית באתר הקיים, ומקטע key="sitemap" בשם "מבנה עמודים מוצע" (רשימת עמודים).',
  landing: 'הוסף ב-extra_sections מקטע key="landing_focus" בשם "על מה יתמקד עמוד הנחיתה": מסר מרכזי, הוכחות אמון והנעה לפעולה.',
  cro: 'הוסף ב-extra_sections מקטע key="cro_hypotheses" בשם "השערות לשיפור ההמרות": 5 השערות לבדיקה, מהגבוהה להשפעה לנמוכה.',
  dashboard: 'הוסף ב-extra_sections מקטע key="kpis" בשם "המדדים שנעקוב אחריהם": 5–8 מדדי KPI מתאימים לסוג העסק.',
  social: 'הוסף ב-extra_sections מקטע key="content_pillars" בשם "עמודי התוכן": 3 עמודי תוכן עם דוגמה לפוסט לכל אחד.',
  media_social: 'הוסף ב-extra_sections מקטע key="audiences" בשם "קהלים וזוויות קריאייטיב": 2–4 קהלים ו-3 זוויות קריאייטיב (רעיון, כותרת לדוגמה, פורמט).',
  media_google: 'הוסף ב-extra_sections מקטע key="campaign_structure" בשם "מבנה הקמפיינים בגוגל": קבוצות מודעות מוצעות לפי השירותים והאזור. בלי עלויות קליק ובלי נפחי חיפוש.',
  consulting: 'הוסף ב-extra_sections מקטע key="first_meetings" בשם "על מה נעבוד בפגישות הראשונות": 3 נושאים.',
};

export function buildSystem(guidelines: string) {
  return `אתה אסטרטג שיווק דיגיטלי בכיר בסוכנות "דיגיטל אפקטיב" בישראל, שכותב את חלק הניתוח בהצעת מחיר ללקוח פוטנציאלי.

עקרונות מחייבים:
- כתוב בעברית עסקית טבעית, ברורה וקונקרטית. לא תרגומית, בלי סלנג ובלי מילים באנגלית כשיש מילה עברית מקובלת.
- ספציפי ולא כללי: ממצא טוב הוא "באתר לא מותקן פיקסל מטא, ולכן אי אפשר לבנות קהלי רימרקטינג ממבקרי האתר". ממצא חלש שאסור לכתוב: "יש מקום לשפר את הנוכחות הדיגיטלית".
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
  if (extras.length) parts.push(`מקטעים נוספים לפי השירותים:\n${extras.map((e) => `- ${e}`).join("\n")}`);
  else parts.push("אין צורך במקטעים נוספים (extra_sections ריק).");

  parts.push(
    "משימה: חפש ברשת 3–5 מתחרים רלוונטיים בישראל באותו תחום ואזור (למשל לפי השירותים המרכזיים של העסק), בדוק בקצרה מה הם עושים טוב, ואז כתוב את הניתוח המלא. נסח את שאילתות החיפוש בעברית וכלול בהן את העיר או האזור בישראל, כדי לקבל תוצאות ישראליות. השתמש לכל היותר ב-5 חיפושים.",
  );
  return parts.join("\n\n");
}

const bullets = (arr: string[]) => arr.filter(Boolean).map((s) => `• ${s.trim()}`).join("\n");
const numbered = (arr: string[]) => arr.filter(Boolean).map((s, n) => `${n + 1}. ${s.trim()}`).join("\n");

/** Converts the model output into proposal sections (all drafts, keyed so a re-run replaces them). */
export function toSections(r: AnalysisResult, sources: string[], newId: () => string): Section[] {
  const s = (aiKey: string, title: string, body: string): Section | null =>
    body.trim() ? { id: newId(), aiKey, title, body: body.trim(), visible: true, source: "ai", status: "draft", sources } : null;
  const findings = [
    ...r.site_findings.filter((f) => f.kind === "strength").map((f) => `✓ ${f.finding}`),
    ...r.site_findings.filter((f) => f.kind === "improve").map((f) => `• ${f.finding}`),
  ].join("\n");
  const comp = [r.competition_summary, r.competitors.map((c) => `• ${c.name}: ${c.strengths}. ${c.gap}`).join("\n")].filter((x) => x.trim()).join("\n\n");
  return [
    s("business", "כך הבנו את העסק שלכם", r.business_summary),
    s("findings", "מה מצאנו באתר", findings),
    s("challenges", "האתגרים המרכזיים", bullets(r.challenges)),
    s("competition", "תמונת התחרות", comp),
    s("opportunities", "ההזדמנויות", bullets(r.opportunities)),
    s("strategy", "האסטרטגיה המוצעת", r.strategy),
    ...r.extra_sections.map((e) => s(`extra:${e.key}`, e.title, e.body)),
    s("first30", "30 הימים הראשונים", numbered(r.first_30_days)),
  ].filter(Boolean) as Section[];
}

/** Replaces earlier AI sections (same aiKey) and puts new ones before library/manual sections. */
export function mergeSections(existing: Section[], fresh: Section[]): Section[] {
  const keys = new Set(fresh.map((f) => f.aiKey));
  const kept = existing.filter((e) => !(e.source === "ai" && e.aiKey && keys.has(e.aiKey)));
  const keptAi = kept.filter((e) => e.source === "ai");
  const rest = kept.filter((e) => e.source !== "ai");
  return [...fresh, ...keptAi, ...rest];
}
