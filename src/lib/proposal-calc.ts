import { computePricing } from "./pricing/engine";
import { checkApprovals, type ApprovalLevel } from "./pricing/approvals";
import { pricingContext, toPricingInput } from "./pricing/meta";
import type { Proposal, ProposalItem, Service, Settings } from "./types";

export const LEVEL_RANK: Record<ApprovalLevel, number> = { none: 0, manager: 1, ceo: 2 };

export function calcProposal(
  proposal: Pick<Proposal, "media_budget" | "commitment_months" | "global_discount_percent"> & Partial<Pick<Proposal, "media_budgets" | "media_fee_percent">>,
  items: ProposalItem[],
  services: Service[],
  settings: Settings,
) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const inputs = [...items].sort((a, b) => a.sort - b.sort).map((i) => toPricingInput(i, byId));
  const ctx = pricingContext(proposal, settings);
  const pricing = computePricing(inputs, ctx);
  const approval = checkApprovals(inputs, ctx, pricing, settings.approval_rules);
  return { inputs, ctx, pricing, approval };
}
