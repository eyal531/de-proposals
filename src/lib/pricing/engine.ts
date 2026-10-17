import type {
  Billing,
  DeterminedBy,
  MediaPool,
  PricedLine,
  PricingContext,
  PricingItemInput,
  PricingModel,
  PricingParams,
  PricingResult,
  Totals,
} from "./types";

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function roundTo(value: number, step: number): number {
  if (!step || step <= 0) return Math.round(value * 100) / 100;
  return Math.round(value / step) * step;
}

export function billingOf(model: PricingModel, params: PricingParams): Billing {
  switch (model) {
    case "fixed_monthly":
    case "media_percent":
    case "hybrid_max":
    case "base_plus_percent":
    case "media_tiers":
      return "monthly";
    case "hourly":
      return params.hourlyBilling === "monthly" ? "monthly" : "one_time";
    default:
      return "one_time";
  }
}

export function usesMediaBudget(model: PricingModel): boolean {
  return ["media_percent", "hybrid_max", "base_plus_percent", "media_tiers"].includes(model);
}

const fmt = (v: number) => `${Math.round(v).toLocaleString("he-IL")} ₪`;

interface ListResult {
  list: number;
  mediaBudgetUsed: number | null;
  breakEvenBudget: number | null;
  determinedBy: DeterminedBy;
  explanation: string;
}

/** Price of a line before any discount. */
export function listPrice(
  model: PricingModel,
  params: PricingParams,
  quantity: number,
  proposalMediaBudget: number | null,
): ListResult {
  const qty = quantity > 0 ? quantity : 1;
  const media =
    params.mediaBudget !== undefined && params.mediaBudget !== null
      ? n(params.mediaBudget)
      : proposalMediaBudget !== null
        ? n(proposalMediaBudget)
        : null;
  const base: ListResult = { list: 0, mediaBudgetUsed: null, breakEvenBudget: null, determinedBy: null, explanation: "" };

  switch (model) {
    case "fixed_monthly": {
      const v = n(params.amount) * qty;
      return { ...base, list: v, explanation: `${fmt(n(params.amount))} לחודש${qty > 1 ? ` × ${qty}` : ""}` };
    }
    case "one_time": {
      const v = n(params.amount) * qty;
      return { ...base, list: v, explanation: `תשלום חד-פעמי${qty > 1 ? ` × ${qty}` : ""}` };
    }
    case "hourly": {
      const v = n(params.rate) * n(params.hours);
      return { ...base, list: v, explanation: `${n(params.hours)} שעות × ${fmt(n(params.rate))}` };
    }
    case "hour_bank": {
      const gross = n(params.rate) * n(params.hours);
      const v = gross * (1 - n(params.bankDiscountPercent) / 100);
      return {
        ...base,
        list: v,
        explanation: `בנק ${n(params.hours)} שעות${params.validityMonths ? `, בתוקף ${params.validityMonths} חודשים` : ""}`,
      };
    }
    case "media_percent": {
      const pct = n(params.percent);
      let v = media !== null ? (media * pct) / 100 : 0;
      let det: DeterminedBy = "percent";
      if (params.cap && v > params.cap) {
        v = params.cap;
        det = "cap";
      }
      return { ...base, list: v, mediaBudgetUsed: media, determinedBy: det, explanation: `${pct}% מתקציב המדיה החודשי` };
    }
    case "hybrid_max": {
      // Media management: the line carries only its base fee. The percentage of the TOTAL media budget
      // is applied once for all such lines together in computePricing (see MediaPool).
      const fixed = n(params.fixed) * qty;
      return { ...base, list: fixed, determinedBy: "fixed", explanation: `דמי ניהול ${fmt(fixed)} לחודש` };
    }
    case "base_plus_percent": {
      const pct = n(params.percent);
      const v = n(params.base) + (media !== null ? (media * pct) / 100 : 0);
      return {
        ...base,
        list: v,
        mediaBudgetUsed: media,
        determinedBy: "percent",
        explanation: `${fmt(n(params.base))} + ${pct}% מתקציב המדיה`,
      };
    }
    case "media_tiers": {
      const tiers = [...(params.tiers ?? [])].sort((a, b) => (a.upTo ?? Infinity) - (b.upTo ?? Infinity));
      const m = media ?? 0;
      const tier = tiers.find((t) => t.upTo === null || m <= t.upTo) ?? tiers[tiers.length - 1];
      return {
        ...base,
        list: tier ? n(tier.fee) : 0,
        mediaBudgetUsed: media,
        determinedBy: "tier",
        explanation: tier
          ? `מדרגה: תקציב ${tier.upTo === null ? "מעל המדרגה הקודמת" : `עד ${fmt(tier.upTo)}`}`
          : "לא הוגדרו מדרגות",
      };
    }
    case "per_unit": {
      const unit = n(params.unitPrice);
      const vd = [...(params.volumeDiscounts ?? [])]
        .filter((d) => qty >= d.minQty)
        .sort((a, b) => b.minQty - a.minQty)[0];
      const v = unit * qty * (1 - (vd ? n(vd.percent) : 0) / 100);
      return {
        ...base,
        list: v,
        explanation: `${qty} ${params.unitLabel || "יחידות"} × ${fmt(unit)}${vd ? ` (הנחת כמות ${vd.percent}%)` : ""}`,
      };
    }
  }
}

/** Which items count toward the totals, given selections. */
export function isIncluded(item: PricingItemInput): boolean {
  if (item.kind === "required") return true;
  return !!item.selected;
}

export function priceLine(item: PricingItemInput, ctx: PricingContext): PricedLine {
  const qty = item.quantity && item.quantity > 0 ? item.quantity : 1;
  const lp = listPrice(item.model, item.params, qty, ctx.mediaBudget);
  let discountAmount = 0;
  if (item.discount && item.discount.value > 0) {
    discountAmount =
      item.discount.type === "percent"
        ? (lp.list * Math.min(item.discount.value, 100)) / 100
        : Math.min(item.discount.value, lp.list);
  }
  const net = roundTo(Math.max(lp.list - discountAmount, 0), ctx.rounding);
  return {
    id: item.id,
    billing: billingOf(item.model, item.params),
    included: isIncluded(item),
    listPrice: roundTo(lp.list, ctx.rounding),
    discountAmount: roundTo(lp.list, ctx.rounding) - net,
    net,
    mediaBudgetUsed: lp.mediaBudgetUsed,
    breakEvenBudget: lp.breakEvenBudget,
    determinedBy: lp.determinedBy,
    explanation: lp.explanation,
  };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export const DEFAULT_MEDIA_FEE_PERCENT = 20;

/** Total monthly media budget: the sum of per-platform rows when present, otherwise the single total. */
export function mediaTotalOf(ctx: Pick<PricingContext, "mediaBudget" | "mediaBudgets">): number | null {
  const rows = (ctx.mediaBudgets ?? []).filter((m) => Number.isFinite(Number(m.amount)));
  if (rows.length) return rows.reduce((a, m) => a + Math.max(Number(m.amount) || 0, 0), 0);
  return ctx.mediaBudget === null || ctx.mediaBudget === undefined ? null : Number(ctx.mediaBudget);
}

function mediaPoolOf(items: PricingItemInput[], lines: PricedLine[], ctx: PricingContext, mediaTotal: number): MediaPool | null {
  const ids = items.filter((i) => i.model === "hybrid_max").map((i) => i.id);
  const pooled = lines.filter((l) => l.included && ids.includes(l.id));
  if (!pooled.length) return null;
  const percent = ctx.mediaFeePercent ?? DEFAULT_MEDIA_FEE_PERCENT;
  const fixedSum = pooled.reduce((a, l) => a + l.net, 0);
  const percentValue = roundTo((mediaTotal * percent) / 100, ctx.rounding);
  const fee = Math.max(fixedSum, percentValue);
  return {
    lineIds: pooled.map((l) => l.id),
    fixedSum,
    mediaTotal,
    percent,
    percentValue,
    fee,
    determinedBy: percentValue > fixedSum ? "percent" : "fixed",
    adjustment: fee - fixedSum,
    breakEvenMedia: percent > 0 ? (fixedSum * 100) / percent : null,
  };
}

export function computePricing(items: PricingItemInput[], ctx: PricingContext): PricingResult {
  const mediaTotal = mediaTotalOf(ctx);
  const effCtx: PricingContext = { ...ctx, mediaBudget: mediaTotal };
  const lines = items.map((i) => priceLine(i, effCtx));
  const inc = lines.filter((l) => l.included);
  const sum = (arr: PricedLine[], f: (l: PricedLine) => number) => arr.reduce((a, l) => a + f(l), 0);

  const monthly = inc.filter((l) => l.billing === "monthly");
  const oneTime = inc.filter((l) => l.billing === "one_time");
  const g = Math.min(Math.max(ctx.globalDiscountPercent || 0, 0), 100) / 100;

  const mediaPool = mediaPoolOf(items, lines, ctx, mediaTotal ?? 0);
  const adjustment = mediaPool?.adjustment ?? 0;

  const monthlyList = sum(monthly, (l) => l.listPrice) + adjustment;
  const monthlyLineNet = sum(monthly, (l) => l.net) + adjustment;
  const oneTimeList = sum(oneTime, (l) => l.listPrice);
  const oneTimeLineNet = sum(oneTime, (l) => l.net);

  const globalDiscountMonthly = roundTo(monthlyLineNet * g, ctx.rounding);
  const globalDiscountOneTime = roundTo(oneTimeLineNet * g, ctx.rounding);
  const monthlyNet = monthlyLineNet - globalDiscountMonthly;
  const oneTimeNet = oneTimeLineNet - globalDiscountOneTime;

  const vat = (ctx.vatRate || 0) / 100;
  const months = Math.max(ctx.commitmentMonths || 0, 1);
  const contractList = oneTimeList + monthlyList * months;
  const contractValue = oneTimeNet + monthlyNet * months;

  const totals: Totals = {
    monthlyList,
    monthlyNet,
    oneTimeList,
    oneTimeNet,
    globalDiscountMonthly,
    globalDiscountOneTime,
    vatMonthly: r2(monthlyNet * vat),
    vatOneTime: r2(oneTimeNet * vat),
    monthlyWithVat: r2(monthlyNet * (1 + vat)),
    oneTimeWithVat: r2(oneTimeNet * (1 + vat)),
    contractValue,
    effectiveDiscountPercent: contractList > 0 ? r2((1 - contractValue / contractList) * 100) : 0,
    mediaTotal: mediaTotal ?? 0,
    mediaFee: mediaPool?.fee ?? 0,
  };
  return { lines, totals, mediaPool };
}

/**
 * Selecting an alternative unselects the others in its group.
 * Returns a new array; required items are never changed.
 */
export function applySelection(items: PricingItemInput[], itemId: string, selected: boolean): PricingItemInput[] {
  const target = items.find((i) => i.id === itemId);
  if (!target || target.kind === "required") return items;
  return items.map((i) => {
    if (i.id === itemId) return { ...i, selected };
    if (selected && target.kind === "alternative" && i.kind === "alternative" && i.groupKey && i.groupKey === target.groupKey) {
      return { ...i, selected: false };
    }
    return i;
  });
}
