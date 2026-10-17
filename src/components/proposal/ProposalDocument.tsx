import { buildGreeting } from "@/lib/greeting";
import { dateHe } from "@/lib/format";
import type { PublicItem, PublicProposal } from "@/lib/public-proposal";
import type { Brand } from "@/lib/types";
import { InteractivePricing } from "./InteractivePricing";
import { ClientActions } from "./ClientActions";
import { BrandFont, BrandLogo, Cover, brandVars } from "./Cover";

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section className="pdoc-section" id={id}>
      <h2 className="pdoc-h2">{title}</h2>
      <div className="pdoc-section-body">{children}</div>
    </section>
  );
}

export function ProposalDocument({
  proposal,
  items,
  brand,
  vatRate,
  rounding,
  mode,
  token,
  interactive,
}: {
  proposal: PublicProposal;
  items: PublicItem[];
  brand: Brand;
  vatRate: number;
  rounding: number;
  mode: "client" | "preview";
  token?: string;
  interactive: boolean;
}) {
  const greeting = buildGreeting({ recipients: proposal.recipients, companyName: proposal.company_name });
  const solutionItems = items.filter((i) => i.description || i.deliverables.length);
  const meta = [
    { label: "הצעה מספר", value: proposal.number },
    { label: "תאריך", value: dateHe(proposal.sent_at ?? new Date().toISOString()) },
    ...(proposal.valid_until ? [{ label: "בתוקף עד", value: dateHe(proposal.valid_until) }] : []),
  ];

  return (
    <div className="pdoc" style={brandVars(brand)}>
      <BrandFont font={brand.font} />
      <Cover brand={brand} greeting={greeting} title={proposal.title} company={proposal.company_name} meta={meta} />

      <main className="pdoc-page">
        {proposal.intro && (
          <section className="pdoc-intro">
            <p className="prose-he">{proposal.intro}</p>
          </section>
        )}

        {proposal.sections.map((s) => (
          <Section key={s.id} title={s.title}>
            <p className="prose-he">{s.body}</p>
          </Section>
        ))}

        {solutionItems.length > 0 && (
          <Section title="הפתרון שלנו">
            <div className="pdoc-services">
              {solutionItems.map((i) => (
                <article key={i.id} className="pdoc-service">
                  <h3>
                    {i.name}
                    {i.kind !== "required" && <span className="pdoc-tag">{i.kind === "optional" ? "תוספת אפשרית" : "חלופה"}</span>}
                  </h3>
                  {i.description && <p className="prose-he">{i.description}</p>}
                  {i.deliverables.length > 0 && (
                    <ul className="pdoc-list">
                      {i.deliverables.map((d, k) => (
                        <li key={k}>{d}</li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </Section>
        )}

        <Section title="ההשקעה" id="investment">
          <InteractivePricing
            items={items}
            mediaBudget={proposal.media_budget}
            mediaBudgets={proposal.media_budgets}
            mediaFeePercent={proposal.media_fee_percent}
            commitmentMonths={proposal.commitment_months}
            globalDiscountPercent={proposal.global_discount_percent}
            showList={proposal.show_list_prices}
            vatRate={vatRate}
            rounding={rounding}
            token={mode === "client" ? token : undefined}
            interactive={interactive}
          />
        </Section>

        {proposal.terms && (
          <Section title="תנאים">
            <p className="prose-he pdoc-small">{proposal.terms}</p>
          </Section>
        )}

        {proposal.status === "accepted" ? (
          <Section title="ההצעה אושרה">
            <p>
              נחתמה על ידי {proposal.signer_name}
              {proposal.signer_role ? `, ${proposal.signer_role}` : ""} בתאריך {dateHe(proposal.accepted_at)}. תודה! ניצור קשר בקרוב לתיאום הצעדים הבאים.
            </p>
          </Section>
        ) : (
          <ClientActions token={mode === "client" ? token : undefined} canSign={interactive} addressForm={proposal.address_form} />
        )}
      </main>

      <footer className="pdoc-footer">
        <BrandLogo brand={brand} onDark={false} className="pdoc-footer-logo" />
        <div className="pdoc-footer-contact">
          {brand.phone && (
            <a href={`tel:${brand.phone.replace(/[^\d+]/g, "")}`} className="num">
              {brand.phone}
            </a>
          )}
          {brand.email && (
            <a href={`mailto:${brand.email}`} className="num">
              {brand.email}
            </a>
          )}
          {brand.website && (
            <a href={`https://${brand.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="num">
              {brand.website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
