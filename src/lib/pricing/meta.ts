import type { ItemKind, PricingModel, PricingItemInput } from "./types";
import type { PricingContext } from "./types";
import type { ProposalItem, Service, Settings, Proposal } from "../types";

export const MODEL_LABEL: Record<PricingModel, string> = {
  fixed_monthly: "ריטיינר חודשי",
  one_time: "פרויקט חד-פעמי",
  hourly: "שעתי",
  hour_bank: "בנק שעות",
  media_percent: "אחוז מהמדיה",
  hybrid_max: "קבוע או % מדיה – הגבוה",
  base_plus_percent: "בסיס + % מדיה",
  media_tiers: "מדרגות לפי מדיה",
  per_unit: "מחיר ליחידה",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  required: "חובה",
  optional: "אופציונלי",
  alternative: "חלופה",
};

export type ParamField =
  | { key: "amount" | "rate" | "hours" | "bankDiscountPercent" | "validityMonths" | "percent" | "fixed" | "cap" | "base" | "unitPrice" | "mediaBudget"; label: string; type: "number"; suffix?: string }
  | { key: "unitLabel"; label: string; type: "text" }
  | { key: "hourlyBilling"; label: string; type: "billing" }
  | { key: "tiers"; label: string; type: "tiers" }
  | { key: "milestones"; label: string; type: "milestones" }
  | { key: "volumeDiscounts"; label: string; type: "volume" };

export const MODEL_FIELDS: Record<PricingModel, ParamField[]> = {
  fixed_monthly: [{ key: "amount", label: "סכום חודשי", type: "number", suffix: "₪" }],
  one_time: [
    { key: "amount", label: "סכום", type: "number", suffix: "₪" },
    { key: "milestones", label: "פריסת תשלומים", type: "milestones" },
  ],
  hourly: [
    { key: "rate", label: "תעריף לשעה", type: "number", suffix: "₪" },
    { key: "hours", label: "שעות", type: "number" },
    { key: "hourlyBilling", label: "חיוב", type: "billing" },
  ],
  hour_bank: [
    { key: "hours", label: "שעות בבנק", type: "number" },
    { key: "rate", label: "תעריף לשעה", type: "number", suffix: "₪" },
    { key: "bankDiscountPercent", label: "הנחת בנק", type: "number", suffix: "%" },
    { key: "validityMonths", label: "תוקף (חודשים)", type: "number" },
  ],
  media_percent: [
    { key: "percent", label: "אחוז מהמדיה", type: "number", suffix: "%" },
    { key: "cap", label: "תקרה (אופציונלי)", type: "number", suffix: "₪" },
    { key: "mediaBudget", label: "תקציב מדיה לשורה (ריק = של ההצעה)", type: "number", suffix: "₪" },
  ],
  hybrid_max: [
    { key: "fixed", label: "סכום קבוע מינימלי", type: "number", suffix: "₪" },
    { key: "percent", label: "אחוז מהמדיה", type: "number", suffix: "%" },
    { key: "cap", label: "תקרה (אופציונלי)", type: "number", suffix: "₪" },
    { key: "mediaBudget", label: "תקציב מדיה לשורה (ריק = של ההצעה)", type: "number", suffix: "₪" },
  ],
  base_plus_percent: [
    { key: "base", label: "בסיס חודשי", type: "number", suffix: "₪" },
    { key: "percent", label: "אחוז מהמדיה", type: "number", suffix: "%" },
    { key: "mediaBudget", label: "תקציב מדיה לשורה (ריק = של ההצעה)", type: "number", suffix: "₪" },
  ],
  media_tiers: [
    { key: "tiers", label: "מדרגות", type: "tiers" },
    { key: "mediaBudget", label: "תקציב מדיה לשורה (ריק = של ההצעה)", type: "number", suffix: "₪" },
  ],
  per_unit: [
    { key: "unitPrice", label: "מחיר ליחידה", type: "number", suffix: "₪" },
    { key: "unitLabel", label: "שם היחידה", type: "text" },
    { key: "volumeDiscounts", label: "הנחות כמות", type: "volume" },
  ],
};

export const usesQuantity = (m: PricingModel) => m === "per_unit" || m === "fixed_monthly" || m === "one_time";

export function toPricingInput(item: ProposalItem, servicesById: Map<string, Service>): PricingItemInput {
  const svc = item.service_id ? servicesById.get(item.service_id) : undefined;
  return {
    id: item.id,
    name: item.name,
    model: item.pricing_model,
    params: item.params ?? {},
    quantity: Number(item.quantity) || 1,
    discount: item.discount,
    kind: item.kind,
    groupKey: item.group_key,
    selected: item.selected,
    isCustom: item.is_custom,
    floorPrice: svc?.floor_price ?? null,
    catalogFixed: svc && svc.pricing_model === "hybrid_max" ? (svc.params.fixed ?? null) : null,
    minCommitmentMonths: svc?.min_commitment_months ?? null,
  };
}

export function pricingContext(p: Pick<Proposal, "media_budget" | "commitment_months" | "global_discount_percent">, s: Pick<Settings, "vat_rate" | "rounding">): PricingContext {
  return {
    vatRate: Number(s.vat_rate),
    rounding: Number(s.rounding),
    mediaBudget: p.media_budget === null || p.media_budget === undefined ? null : Number(p.media_budget),
    commitmentMonths: Number(p.commitment_months) || 1,
    globalDiscountPercent: Number(p.global_discount_percent) || 0,
  };
}
