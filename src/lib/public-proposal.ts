// What the client page is allowed to see. Never pass the raw proposal (it has internal notes) to the browser.
import type { AddressForm, Recipient } from "./greeting";
import type { Discount, ItemKind, PricingModel, PricingParams } from "./pricing/types";
import type { Proposal, ProposalItem, ProposalStatus, Section } from "./types";

export interface PublicItem {
  id: string;
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
}

export interface PublicProposal {
  number: string;
  title: string;
  status: ProposalStatus;
  company_name: string | null;
  recipients: Pick<Recipient, "name" | "role">[];
  address_form: AddressForm;
  intro: string;
  sections: Pick<Section, "id" | "title" | "body">[];
  terms: string;
  media_budget: number | null;
  commitment_months: number;
  global_discount_percent: number;
  show_list_prices: boolean;
  valid_until: string | null;
  sent_at: string | null;
  accepted_at: string | null;
  signer_name: string | null;
  signer_role: string | null;
}

export function toPublic(p: Proposal, items: ProposalItem[]): { proposal: PublicProposal; items: PublicItem[] } {
  return {
    proposal: {
      number: p.number,
      title: p.title,
      status: p.status,
      company_name: p.company_name,
      recipients: (p.recipients ?? []).map((r) => ({ name: r.name, role: r.role })),
      address_form: p.address_form,
      intro: p.intro,
      sections: (p.sections ?? []).filter((s) => s.visible).map((s) => ({ id: s.id, title: s.title, body: s.body })),
      terms: p.terms,
      media_budget: p.media_budget === null ? null : Number(p.media_budget),
      commitment_months: Number(p.commitment_months),
      global_discount_percent: Number(p.global_discount_percent),
      show_list_prices: p.show_list_prices,
      valid_until: p.valid_until,
      sent_at: p.sent_at,
      accepted_at: p.accepted_at,
      signer_name: p.signer?.name ?? null,
      signer_role: p.signer?.role ?? null,
    },
    items: [...items]
      .sort((a, b) => a.sort - b.sort)
      .map((i) => ({
        id: i.id,
        name: i.name,
        description: i.description,
        deliverables: (i.deliverables ?? []).filter((d) => d.trim()),
        pricing_model: i.pricing_model,
        params: i.params ?? {},
        quantity: Number(i.quantity) || 1,
        discount: i.discount,
        kind: i.kind,
        group_key: i.group_key,
        selected: i.selected,
      })),
  };
}
