import { describe, expect, it } from "vitest";
import { buildPrompt, mergeSections, toSections, type AnalysisResult } from "./analyze";
import type { Section } from "../types";

let n = 0;
const id = () => `id${++n}`;
const result: AnalysisResult = {
  business_summary: "קליניקה לאסתטיקה.",
  site_findings: [{ finding: "יש וואטסאפ", kind: "strength" }, { finding: "אין פיקסל מטא", kind: "improve" }],
  challenges: ["תחרות גבוהה"],
  competitors: [{ name: "מתחרה א", strengths: "מודעות חזקות", gap: "אין מחירון" }],
  competition_summary: "שוק צפוף.",
  opportunities: ["רימרקטינג"],
  strategy: "מטא + גוגל.",
  first_30_days: ["התקנת פיקסל", "הקמת קמפיין"],
  extra_sections: [{ key: "seo_topics", title: "נושאי חיפוש", body: "טיפולי פנים" }],
  internal_notes: [],
};

describe("AI analysis → sections", () => {
  it("builds keyed draft sections with bullets and numbering", () => {
    const s = toSections(result, ["https://acme.co.il/"], id);
    expect(s.map((x) => x.aiKey)).toEqual(["business", "findings", "challenges", "competition", "opportunities", "strategy", "extra:seo_topics", "first30"]);
    expect(s.every((x) => x.source === "ai" && x.status === "draft")).toBe(true);
    expect(s[1].body).toBe("✓ יש וואטסאפ\n• אין פיקסל מטא");
    expect(s.at(-1)!.body).toBe("1. התקנת פיקסל\n2. הקמת קמפיין");
    expect(s[3].body).toContain("• מתחרה א: מודעות חזקות. אין מחירון");
  });

  it("re-run replaces old AI sections and keeps library sections after them", () => {
    const lib: Section = { id: "L", title: "למה אנחנו", body: "x", visible: true, source: "library", status: "approved" };
    const old = toSections(result, [], id);
    const fresh = toSections({ ...result, business_summary: "חדש" }, [], id);
    const merged = mergeSections([lib, ...old], fresh);
    expect(merged.filter((s) => s.aiKey === "business")).toHaveLength(1);
    expect(merged[0].body).toBe("חדש");
    expect(merged.at(-1)!.id).toBe("L");
  });

  it("prompt includes call notes, address form and service extras", () => {
    const p = buildPrompt({ companyName: "אקמה", website: "https://acme.co.il", callNotes: "רוצים יותר לידים", services: [{ name: "SEO", profile: "seo" }], addressForm: "plural", guidelines: "", site: null });
    expect(p).toContain("רוצים יותר לידים");
    expect(p).toContain("לשון רבים");
    expect(p).toContain("seo_topics");
  });
});
