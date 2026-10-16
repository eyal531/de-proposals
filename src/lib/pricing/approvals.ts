import type { PricingContext, PricingItemInput, PricingResult } from "./types";

export type ApprovalLevel = "none" | "manager" | "ceo";

export interface ApprovalRules {
  /** up to this overall/line discount % no approval is needed */
  discountFreeMaxPercent: number;
  /** up to this % a sales manager approves; above it the CEO */
  discountManagerMaxPercent: number;
  /** contract value above which CEO approval is required (0 = off) */
  contractValueCeoThreshold: number;
  customItemLevel: ApprovalLevel;
  belowFloorLevel: ApprovalLevel;
  hybridBelowCatalogLevel: ApprovalLevel;
  shortCommitmentLevel: ApprovalLevel;
}

export const DEFAULT_APPROVAL_RULES: ApprovalRules = {
  discountFreeMaxPercent: 10,
  discountManagerMaxPercent: 20,
  contractValueCeoThreshold: 150000,
  customItemLevel: "manager",
  belowFloorLevel: "ceo",
  hybridBelowCatalogLevel: "manager",
  shortCommitmentLevel: "manager",
};

export interface ApprovalReason {
  code: string;
  level: ApprovalLevel;
  message: string;
  itemId?: string;
}

export interface ApprovalCheck {
  level: ApprovalLevel;
  reasons: ApprovalReason[];
}

const RANK: Record<ApprovalLevel, number> = { none: 0, manager: 1, ceo: 2 };
export const maxLevel = (a: ApprovalLevel, b: ApprovalLevel): ApprovalLevel => (RANK[a] >= RANK[b] ? a : b);
export const LEVEL_LABEL: Record<ApprovalLevel, string> = { none: "ללא אישור", manager: "מנהל מכירות", ceo: 'מנכ"ל' };

const fmt = (v: number) => `${Math.round(v).toLocaleString("he-IL")} ₪`;

export function checkApprovals(
  items: PricingItemInput[],
  ctx: PricingContext,
  pricing: PricingResult,
  rules: ApprovalRules = DEFAULT_APPROVAL_RULES,
): ApprovalCheck {
  const reasons: ApprovalReason[] = [];
  const discountLevel = (pct: number): ApprovalLevel =>
    pct <= rules.discountFreeMaxPercent + 1e-9 ? "none" : pct <= rules.discountManagerMaxPercent + 1e-9 ? "manager" : "ceo";

  for (const item of items) {
    const line = pricing.lines.find((l) => l.id === item.id);
    if (!line) continue;
    // optional items the client may still pick are checked too: the offer itself is what needs approval
    if (line.listPrice > 0 && line.discountAmount > 0) {
      const pct = (line.discountAmount / line.listPrice) * 100;
      const lvl = discountLevel(pct);
      if (lvl !== "none")
        reasons.push({ code: "line_discount", level: lvl, itemId: item.id, message: `הנחה של ${pct.toFixed(1)}% על "${item.name}"` });
    }
    if (item.isCustom && rules.customItemLevel !== "none")
      reasons.push({ code: "custom_item", level: rules.customItemLevel, itemId: item.id, message: `פריט שאינו בקטלוג: "${item.name}"` });

    if (item.floorPrice && item.floorPrice > 0) {
      const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
      const perUnit = line.billing === "monthly" ? line.net : line.net / qty;
      if (perUnit + 1e-9 < item.floorPrice)
        reasons.push({
          code: "below_floor",
          level: rules.belowFloorLevel,
          itemId: item.id,
          message: `"${item.name}" במחיר ${fmt(perUnit)}, מתחת למחיר הרצפה ${fmt(item.floorPrice)}`,
        });
    }
    if (item.model === "hybrid_max" && item.catalogFixed && (item.params.fixed ?? 0) + 1e-9 < item.catalogFixed)
      reasons.push({
        code: "hybrid_fixed_low",
        level: rules.hybridBelowCatalogLevel,
        itemId: item.id,
        message: `הסכום הקבוע ב"${item.name}" (${fmt(item.params.fixed ?? 0)}) נמוך מהמחירון (${fmt(item.catalogFixed)})`,
      });
    if (
      line.billing === "monthly" &&
      item.minCommitmentMonths &&
      ctx.commitmentMonths > 0 &&
      ctx.commitmentMonths < item.minCommitmentMonths
    )
      reasons.push({
        code: "short_commitment",
        level: rules.shortCommitmentLevel,
        itemId: item.id,
        message: `התחייבות ל-${ctx.commitmentMonths} חודשים, פחות מהמינימום (${item.minCommitmentMonths}) ב"${item.name}"`,
      });
  }

  if (ctx.globalDiscountPercent > 0) {
    const lvl = discountLevel(ctx.globalDiscountPercent);
    if (lvl !== "none")
      reasons.push({ code: "global_discount", level: lvl, message: `הנחה כללית של ${ctx.globalDiscountPercent}%` });
  }
  const eff = pricing.totals.effectiveDiscountPercent;
  const effLvl = discountLevel(eff);
  if (effLvl !== "none" && !reasons.some((r) => r.code === "global_discount" && RANK[r.level] >= RANK[effLvl]))
    reasons.push({ code: "effective_discount", level: effLvl, message: `הנחה מצטברת של ${eff.toFixed(1)}% על ההצעה` });

  if (rules.contractValueCeoThreshold > 0 && pricing.totals.contractValue > rules.contractValueCeoThreshold)
    reasons.push({
      code: "contract_value",
      level: "ceo",
      message: `ערך התקשרות ${fmt(pricing.totals.contractValue)}, מעל ${fmt(rules.contractValueCeoThreshold)}`,
    });

  const level = reasons.reduce<ApprovalLevel>((acc, r) => maxLevel(acc, r.level), "none");
  return { level, reasons };
}
