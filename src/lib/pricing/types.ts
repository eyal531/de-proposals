// Shared pricing types. Used by the builder (browser), the client page (browser) and the server.

export type PricingModel =
  | "fixed_monthly" // ריטיינר חודשי קבוע
  | "one_time" // פרויקט חד-פעמי
  | "hourly" // שעתי לפי הערכת שעות
  | "hour_bank" // בנק שעות
  | "media_percent" // אחוז מתקציב המדיה
  | "hybrid_max" // הגבוה מבין סכום קבוע לאחוז מהמדיה
  | "base_plus_percent" // בסיס + אחוז מהמדיה
  | "media_tiers" // מדרגות לפי תקציב מדיה
  | "per_unit"; // מחיר ליחידה × כמות

export type Billing = "monthly" | "one_time";

export interface Milestone {
  label: string;
  percent: number;
}

export interface MediaTier {
  /** upper bound of monthly media budget (inclusive); null = no upper bound */
  upTo: number | null;
  fee: number;
}

export interface VolumeDiscount {
  minQty: number;
  percent: number;
}

/** Parameters per model. Only the fields relevant to the model are used. */
export interface PricingParams {
  amount?: number; // fixed_monthly, one_time
  milestones?: Milestone[]; // one_time
  rate?: number; // hourly, hour_bank
  hours?: number; // hourly, hour_bank
  hourlyBilling?: Billing; // hourly: billed monthly or once
  bankDiscountPercent?: number; // hour_bank
  validityMonths?: number; // hour_bank (informational)
  percent?: number; // media_percent, hybrid_max, base_plus_percent
  fixed?: number; // hybrid_max: the minimum fixed fee
  cap?: number | null; // hybrid_max / media_percent: optional maximum fee
  base?: number; // base_plus_percent
  tiers?: MediaTier[]; // media_tiers
  unitPrice?: number; // per_unit
  unitLabel?: string; // per_unit
  volumeDiscounts?: VolumeDiscount[]; // per_unit
  /** media budget for this line; if missing the proposal-level budget is used */
  mediaBudget?: number | null;
}

export type Discount = { type: "percent" | "amount"; value: number } | null;

export type ItemKind = "required" | "optional" | "alternative";

export interface PricingItemInput {
  id: string;
  name: string;
  model: PricingModel;
  params: PricingParams;
  quantity?: number;
  discount?: Discount;
  kind: ItemKind;
  /** alternatives sharing the same groupKey are mutually exclusive */
  groupKey?: string | null;
  selected: boolean;
  isCustom?: boolean;
  /** from the catalog, used for approval checks */
  floorPrice?: number | null;
  catalogFixed?: number | null;
  minCommitmentMonths?: number | null;
}

/** One platform's estimated monthly media budget (paid by the client directly to the platform). */
export interface MediaBudgetLine {
  id: string;
  platform: string;
  amount: number;
}

export interface PricingContext {
  vatRate: number; // e.g. 18
  rounding: number; // round line nets to this step (1 = whole shekels, 10 = tens)
  /** total estimated monthly media budget; ignored when mediaBudgets has rows */
  mediaBudget: number | null;
  /** per-platform media budgets; their sum is the total media budget */
  mediaBudgets?: MediaBudgetLine[];
  /** media management fee = MAX(sum of management base fees, this % × total media). Default 20. */
  mediaFeePercent?: number;
  commitmentMonths: number; // for contract value
  globalDiscountPercent: number; // 0..100
}

/**
 * Pooled media-management fee (all `hybrid_max` lines together):
 * fee = MAX(sum of their base fees after line discounts, percent × total media budget).
 */
export interface MediaPool {
  lineIds: string[];
  fixedSum: number;
  mediaTotal: number;
  percent: number;
  percentValue: number;
  fee: number;
  determinedBy: "fixed" | "percent";
  /** extra amount added on top of the base fees when the percentage wins */
  adjustment: number;
  /** media total at which the percentage starts to exceed the base fees */
  breakEvenMedia: number | null;
}

export type DeterminedBy = "fixed" | "percent" | "cap" | "tier" | null;

export interface PricedLine {
  id: string;
  billing: Billing;
  included: boolean;
  listPrice: number; // before line discount
  discountAmount: number;
  net: number; // after line discount, before global discount
  /** hybrid / percent explanation */
  mediaBudgetUsed: number | null;
  breakEvenBudget: number | null;
  determinedBy: DeterminedBy;
  /** short Hebrew explanation of how the price was computed */
  explanation: string;
}

export interface Totals {
  monthlyList: number;
  monthlyNet: number; // after line + global discount
  oneTimeList: number;
  oneTimeNet: number;
  globalDiscountMonthly: number;
  globalDiscountOneTime: number;
  vatMonthly: number;
  vatOneTime: number;
  monthlyWithVat: number;
  oneTimeWithVat: number;
  contractValue: number; // oneTimeNet + monthlyNet × commitmentMonths (before VAT)
  effectiveDiscountPercent: number; // overall, for approvals
  /** total estimated monthly media budget (informational – paid to the platforms, not included above) */
  mediaTotal: number;
  /** pooled media-management fee included in monthlyNet (0 when none) */
  mediaFee: number;
}

export interface PricingResult {
  lines: PricedLine[];
  totals: Totals;
  /** null when the proposal has no included media-management lines */
  mediaPool: MediaPool | null;
}
