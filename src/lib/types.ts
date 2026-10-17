import type { ApprovalLevel, ApprovalReason, ApprovalRules } from "./pricing/approvals";
import type { AddressForm, Recipient } from "./greeting";
import type { Discount, ItemKind, MediaBudgetLine, PricingModel, PricingParams, Totals } from "./pricing/types";

export type UserRole = "admin" | "approver" | "sales" | "viewer";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  active: boolean;
}

export interface Settings {
  company_name: string;
  vat_rate: number;
  rounding: number;
  default_validity_days: number;
  default_commitment_months: number;
  allowed_email_domains: string[];
  free_email_domains: string[];
  approval_rules: ApprovalRules;
  default_terms: string;
  default_media_fee_percent: number;
  brand: Brand;
  ai_guidelines: string;
}

export type CoverStyle = "dark" | "accent" | "light";

export interface Brand {
  logo_url: string;
  /** how to show the logo on a dark cover: invert a dark logo to white, or use a separate light logo */
  logo_on_dark: "invert" | "as_is";
  accent: string;
  font: string;
  cover: CoverStyle;
  phone: string;
  email: string;
  website: string;
}

export const DEFAULT_BRAND: Brand = {
  logo_url: "/brand/logo.png",
  logo_on_dark: "invert",
  accent: "#2340E8",
  font: "IBM Plex Sans Hebrew",
  cover: "dark",
  phone: "072-392-3000",
  email: "info@digitaleffective.com",
  website: "digitaleffective.co.il",
};

export const BRAND_FONTS = ["IBM Plex Sans Hebrew", "Heebo", "Rubik", "Assistant", "Noto Sans Hebrew", "Frank Ruhl Libre"] as const;

export interface Service {
  id: string;
  category: string;
  name: string;
  client_name: string;
  description: string;
  deliverables: string[];
  exclusions: string[];
  pricing_model: PricingModel;
  params: PricingParams;
  floor_price: number | null;
  min_commitment_months: number | null;
  unit_label: string | null;
  ai_profile: string | null;
  active: boolean;
  sort: number;
}

export interface ContentBlock {
  id: string;
  title: string;
  body: string;
  service_ids: string[];
  locked: boolean;
  sort: number;
  active: boolean;
}

export type SectionSource = "library" | "manual" | "ai";
export type SectionStatus = "draft" | "edited" | "approved";

export interface Section {
  id: string;
  title: string;
  body: string;
  visible: boolean;
  source: SectionSource;
  status: SectionStatus;
  locked?: boolean;
  /** stable key of an AI-generated section (e.g. "challenges"), so a re-run replaces it */
  aiKey?: string;
  /** internal: pages / search results the AI text was based on */
  sources?: string[];
}

export type ProposalStatus =
  | "draft"
  | "pending_approval"
  | "changes_requested"
  | "approved"
  | "sent"
  | "viewed"
  | "negotiation"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";

export interface Proposal {
  id: string;
  number: string;
  title: string;
  status: ProposalStatus;
  client_id: string | null;
  company_name: string | null;
  recipients: Recipient[];
  address_form: AddressForm;
  website: string | null;
  call_notes: string;
  intro: string;
  sections: Section[];
  terms: string;
  media_budget: number | null;
  media_budgets: MediaBudgetLine[];
  media_fee_percent: number;
  commitment_months: number;
  global_discount_percent: number;
  show_list_prices: boolean;
  valid_until: string | null;
  totals: Totals | null;
  approval_level: ApprovalLevel;
  approval_reasons: ApprovalReason[];
  approved_at: string | null;
  public_token: string;
  current_version: number;
  sent_at: string | null;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  accepted_at: string | null;
  signer: { name: string; role?: string; signature?: string; ip?: string; user_agent?: string; at?: string } | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  internal_notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ProposalItem {
  id: string;
  proposal_id: string;
  service_id: string | null;
  name: string;
  description: string;
  deliverables: string[];
  pricing_model: PricingModel;
  params: PricingParams;
  quantity: number;
  discount: Discount;
  kind: ItemKind;
  group_key: string | null;
  selected: boolean;
  is_custom: boolean;
  sort: number;
}

export interface Approval {
  id: string;
  proposal_id: string;
  level: ApprovalLevel;
  reasons: ApprovalReason[];
  request_note: string;
  requested_by: string | null;
  decision: "pending" | "approved" | "rejected" | "changes_requested";
  decision_note: string;
  decided_by: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface ProposalEvent {
  id: number;
  proposal_id: string;
  type: string;
  meta: Record<string, unknown>;
  actor: string | null;
  created_at: string;
}

export const STATUS_LABEL: Record<ProposalStatus, string> = {
  draft: "טיוטה",
  pending_approval: "ממתינה לאישור",
  changes_requested: "הוחזרה לתיקון",
  approved: "מאושרת לשליחה",
  sent: "נשלחה",
  viewed: "נצפתה",
  negotiation: "במשא ומתן",
  accepted: "נחתמה",
  rejected: "נדחתה",
  expired: "פג תוקף",
  cancelled: "בוטלה",
};

export const STATUS_COLOR: Record<ProposalStatus, string> = {
  draft: "badge-gray",
  pending_approval: "badge-amber",
  changes_requested: "badge-amber",
  approved: "badge-blue",
  sent: "badge-blue",
  viewed: "badge-violet",
  negotiation: "badge-violet",
  accepted: "badge-green",
  rejected: "badge-red",
  expired: "badge-gray",
  cancelled: "badge-gray",
};

/** statuses in which the client link is live */
export const LIVE_STATUSES: ProposalStatus[] = ["sent", "viewed", "negotiation", "accepted", "rejected", "expired"];
/** statuses in which the client may still interact (select, sign) */
export const OPEN_STATUSES: ProposalStatus[] = ["sent", "viewed", "negotiation"];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "מנהל מערכת",
  approver: "מאשר",
  sales: "איש מכירות",
  viewer: "צופה",
};
