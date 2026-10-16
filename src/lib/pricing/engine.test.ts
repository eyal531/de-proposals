import { describe, expect, it } from "vitest";
import { applySelection, computePricing, listPrice, priceLine } from "./engine";
import { checkApprovals } from "./approvals";
import type { PricingContext, PricingItemInput } from "./types";

const ctx: PricingContext = { vatRate: 18, rounding: 1, mediaBudget: null, commitmentMonths: 6, globalDiscountPercent: 0 };

const hybrid = (media: number | null, cap?: number) =>
  listPrice("hybrid_max", { fixed: 4000, percent: 20, cap: cap ?? null }, 1, media);

describe("hybrid_max – הגבוה מבין 4,000 ₪ ל-20% מהמדיה (טבלת הדוגמה באפיון 6.2)", () => {
  it.each([
    [10000, 4000, "fixed"],
    [20000, 4000, "fixed"],
    [35000, 7000, "percent"],
    [60000, 12000, "percent"],
  ])("מדיה %i → %i (%s)", (media, fee, by) => {
    const r = hybrid(media);
    expect(r.list).toBe(fee);
    expect(r.determinedBy).toBe(by);
  });
  it("נקודת שוויון 20,000 ₪", () => expect(hybrid(1).breakEvenBudget).toBe(20000));
  it("תקרה", () => {
    const r = hybrid(60000, 10000);
    expect(r.list).toBe(10000);
    expect(r.determinedBy).toBe("cap");
  });
  it("ללא תקציב – הסכום הקבוע", () => expect(hybrid(null).list).toBe(4000));
  it("תקציב ברמת השורה גובר על תקציב ההצעה", () => {
    expect(listPrice("hybrid_max", { fixed: 4000, percent: 20, mediaBudget: 50000 }, 1, 10000).list).toBe(10000);
  });
});

describe("מודלים נוספים", () => {
  it("base_plus_percent", () => expect(listPrice("base_plus_percent", { base: 2500, percent: 10 }, 1, 30000).list).toBe(5500));
  it("media_tiers", () => {
    const tiers = [
      { upTo: 20000, fee: 4000 },
      { upTo: 50000, fee: 7000 },
      { upTo: null, fee: 10000 },
    ];
    expect(listPrice("media_tiers", { tiers }, 1, 15000).list).toBe(4000);
    expect(listPrice("media_tiers", { tiers }, 1, 20000).list).toBe(4000);
    expect(listPrice("media_tiers", { tiers }, 1, 35000).list).toBe(7000);
    expect(listPrice("media_tiers", { tiers }, 1, 90000).list).toBe(10000);
  });
  it("hour_bank with discount", () =>
    expect(listPrice("hour_bank", { hours: 20, rate: 650, bankDiscountPercent: 15 }, 1, null).list).toBeCloseTo(11050));
  it("per_unit with volume discount", () => {
    const p = { unitPrice: 3500, volumeDiscounts: [{ minQty: 3, percent: 10 }] };
    expect(listPrice("per_unit", p, 2, null).list).toBe(7000);
    expect(listPrice("per_unit", p, 3, null).list).toBe(9450);
  });
  it("hourly billing", () => {
    const l = priceLine(
      { id: "h", name: "ייעוץ", model: "hourly", params: { rate: 650, hours: 4, hourlyBilling: "monthly" }, kind: "required", selected: true },
      ctx,
    );
    expect(l.billing).toBe("monthly");
    expect(l.net).toBe(2600);
  });
});

const items: PricingItemInput[] = [
  { id: "fb", name: "פייסבוק", model: "hybrid_max", params: { fixed: 4000, percent: 20 }, kind: "required", selected: true },
  { id: "seo", name: "SEO", model: "fixed_monthly", params: { amount: 5000 }, kind: "required", selected: true, discount: { type: "percent", value: 10 } },
  { id: "setup", name: "הקמה", model: "one_time", params: { amount: 2500 }, kind: "required", selected: true },
  { id: "dash", name: "דשבורד", model: "one_time", params: { amount: 6000 }, kind: "optional", selected: false },
  { id: "s1", name: "סושיאל בסיס", model: "fixed_monthly", params: { amount: 3000 }, kind: "alternative", groupKey: "social", selected: true },
  { id: "s2", name: "סושיאל פרימיום", model: "fixed_monthly", params: { amount: 5000 }, kind: "alternative", groupKey: "social", selected: false },
];

describe("סיכומים", () => {
  it("חודשי וחד-פעמי בנפרד, אופציה לא נבחרה לא נספרת", () => {
    const r = computePricing(items, { ...ctx, mediaBudget: 30000 });
    // fb 6000 + seo 4500 + social 3000
    expect(r.totals.monthlyNet).toBe(13500);
    expect(r.totals.oneTimeNet).toBe(2500);
    expect(r.totals.vatMonthly).toBe(2430);
    expect(r.totals.contractValue).toBe(2500 + 13500 * 6);
  });
  it("בחירת חלופה מבטלת את האחרת בקבוצה", () => {
    const next = applySelection(items, "s2", true);
    expect(next.find((i) => i.id === "s1")!.selected).toBe(false);
    expect(next.find((i) => i.id === "s2")!.selected).toBe(true);
    expect(computePricing(next, ctx).totals.monthlyNet).toBe(4000 + 4500 + 5000);
  });
  it("פריט חובה לא ניתן לביטול", () => {
    expect(applySelection(items, "fb", false)).toBe(items);
  });
  it("הנחה כללית", () => {
    const r = computePricing(items, { ...ctx, globalDiscountPercent: 10 });
    expect(r.totals.globalDiscountOneTime).toBe(250);
    expect(r.totals.oneTimeNet).toBe(2250);
  });
  it("עיגול לעשרות", () => {
    const l = priceLine(
      { id: "x", name: "x", model: "fixed_monthly", params: { amount: 3333 }, kind: "required", selected: true, discount: { type: "percent", value: 7 } },
      { ...ctx, rounding: 10 },
    );
    expect(l.net % 10).toBe(0);
  });
});

describe("ספי אישור", () => {
  const run = (its: PricingItemInput[], c: Partial<PricingContext> = {}) => {
    const cc = { ...ctx, ...c };
    return checkApprovals(its, cc, computePricing(its, cc));
  };
  const base: PricingItemInput = { id: "a", name: "SEO", model: "fixed_monthly", params: { amount: 5000 }, kind: "required", selected: true };

  it("הנחה עד 10% – ללא אישור", () => expect(run([{ ...base, discount: { type: "percent", value: 10 } }]).level).toBe("none"));
  it("הנחה 15% – מנהל מכירות", () => expect(run([{ ...base, discount: { type: "percent", value: 15 } }]).level).toBe("manager"));
  it("הנחה 25% – מנכ\"ל", () => expect(run([{ ...base, discount: { type: "percent", value: 25 } }]).level).toBe("ceo"));
  it("מתחת לרצפה – מנכ\"ל", () => expect(run([{ ...base, floorPrice: 6000 }]).reasons[0].code).toBe("below_floor"));
  it("פריט חופשי – מנהל", () => expect(run([{ ...base, isCustom: true }]).level).toBe("manager"));
  it("סכום קבוע נמוך מהמחירון במודל ההיברידי", () =>
    expect(run([{ ...base, model: "hybrid_max", params: { fixed: 3000, percent: 20 }, catalogFixed: 4000 }]).level).toBe("manager"));
  it("ערך התקשרות גבוה", () => expect(run([{ ...base, params: { amount: 30000 } }]).level).toBe("ceo"));
  it("התחייבות קצרה מהמינימום", () =>
    expect(run([{ ...base, minCommitmentMonths: 6 }], { commitmentMonths: 3 }).reasons[0].code).toBe("short_commitment"));
  it("מקרה רגיל – ללא אישור", () => expect(run([base]).level).toBe("none"));
});
