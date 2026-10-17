import { describe, expect, it } from "vitest";
import { buildPrompt, mergeSections, toSections, type AnalysisResult } from "./analyze";
import type { Section } from "../types";

let n = 0;
const id = () => `id${++n}`;
const result: AnalysisResult = {
  business_summary: "קליניקה לאסתטיקה.",
  challenges: ["אין פיקסל מטא", "תחרות גבוהה", "אין מחירון", "אתגר רביעי שיחתך"],
  opportunities: ["רימרקטינג"],
  competitors: [{ name: "מתחרה א", note: "מודעות חזקות, אין מחירון" }],
  competition_summary: "שוק צפוף.",
  strategy: "מטא + גוגל.",
  first_steps: ["התקנת פיקסל", "הקמת קמפיין"],
  extra_sections: [{ key: "seo_topics", title: "נושאי חיפוש", body: "טיפולי פנים" }],
  internal_notes: [],
};

describe("AI analysis → sections", () => {
  it("builds keyed draft sections with bullets and numbering", () => {
    const s = toSections(result, ["https://acme.co.il/"], id);
    expect(s.map((x) => x.aiKey)).toEqual(["business", "challenges", "competition", "strategy", "extra:seo_topics", "first30"]);
    expect(s.every((x) => x.source === "ai" && x.status === "draft")).toBe(true);
    expect(s[1].body).toBe("האתגרים:\n• אין פיקסל מטא\n• תחרות גבוהה\n• אין מחירון\n\nההזדמנויות:\n• רימרקטינג");
    expect(s.at(-1)!.body).toBe("1. התקנת פיקסל\n2. הקמת קמפיין");
    expect(s[2].body).toContain("• מתחרה א: מודעות חזקות, אין מחירון");
  });

  it("re-run replaces old AI sections and keeps library sections after them", () => {
    const lib: Section = { id: "L", title: "למה אנחנו", body: "x", visible: true, source: "library", status: "approved" };
    const old = toSections(result, [], id);
    const fresh = toSections({ ...result, business_summary: "חדש" }, [], id);
    const legacy: Section = { id: "F", aiKey: "findings", title: "מה מצאנו באתר", body: "x", visible: true, source: "ai", status: "draft" };
    const merged = mergeSections([lib, legacy, ...old], fresh);
    expect(merged.some((s) => s.aiKey === "findings")).toBe(false);
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

describe("web search tool definition", () => {
  it("does not send a user_location (IL is not supported by the API)", async () => {
    const { WEB_SEARCH_TOOL } = await import("./analyze");
    expect("user_location" in WEB_SEARCH_TOOL).toBe(false);
    expect(WEB_SEARCH_TOOL.max_uses).toBeLessThanOrEqual(3);
  });
});

describe("AI cost", () => {
  it("prices Haiku per request with the 5x tier above 100K prompt tokens", async () => {
    const { requestCost } = await import("./cost");
    expect(requestCost("claude-haiku-5-5", 50_000, 4_000)).toBeCloseTo(0.007, 6);
    expect(requestCost("claude-haiku-5-5", 120_000, 4_000)).toBeCloseTo(0.07, 6);
    expect(requestCost("claude-sonnet-5-5", 50_000, 4_000, 3)).toBeCloseTo(0.17, 6);
  });
});
