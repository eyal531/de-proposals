import { buildGreeting } from "@/lib/greeting";
import { dateHe } from "@/lib/format";
import type { PublicItem, PublicProposal } from "@/lib/public-proposal";
import { InteractivePricing } from "./InteractivePricing";
import { ClientActions } from "./ClientActions";

export function ProposalDocument({
  proposal,
  items,
  companyName,
  vatRate,
  rounding,
  mode,
  token,
  interactive,
}: {
  proposal: PublicProposal;
  items: PublicItem[];
  companyName: string;
  vatRate: number;
  rounding: number;
  mode: "client" | "preview";
  token?: string;
  interactive: boolean;
}) {
  const greeting = buildGreeting({ recipients: proposal.recipients, companyName: proposal.company_name });
  const solutionItems = items.filter((i) => i.description || i.deliverables.length);

  return (
    <article className="doc mx-auto max-w-3xl space-y-6 px-4 py-8">
      {/* cover */}
      <section className="card space-y-6 py-10">
        <div className="flex items-center justify-between">
          <div className="text-lg font-bold text-brand">{companyName}</div>
          <div className="num text-sm text-muted">
            הצעה {proposal.number} · {dateHe(proposal.sent_at ?? new Date().toISOString())}
          </div>
        </div>
        {greeting && (
          <div className="leading-7">
            {greeting.map((l, i) => (
              <div key={i} className={i === 0 ? "text-muted" : "font-bold"}>
                {l}
              </div>
            ))}
          </div>
        )}
        <h1 className="text-3xl font-bold leading-tight text-ink">{proposal.title}</h1>
        {proposal.valid_until && <p className="text-sm text-muted">ההצעה בתוקף עד {dateHe(proposal.valid_until)}</p>}
      </section>

      {proposal.intro && (
        <section className="card">
          <p className="prose-he">{proposal.intro}</p>
        </section>
      )}

      {proposal.sections.map((s) => (
        <section key={s.id} className="card">
          <h2>{s.title}</h2>
          <p className="prose-he">{s.body}</p>
        </section>
      ))}

      {solutionItems.length > 0 && (
        <section className="card space-y-5">
          <h2>הפתרון המוצע</h2>
          {solutionItems.map((i) => (
            <div key={i.id}>
              <h3 className="font-bold">
                {i.name}
                {i.kind !== "required" && <span className="ms-2 text-xs font-normal text-muted">({i.kind === "optional" ? "תוספת אפשרית" : "חלופה"})</span>}
              </h3>
              {i.description && <p className="prose-he text-[15px]">{i.description}</p>}
              {i.deliverables.length > 0 && (
                <ul className="mt-1 list-disc space-y-0.5 ps-5 text-[15px]">
                  {i.deliverables.map((d, k) => (
                    <li key={k}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </section>
      )}

      <InteractivePricing
        items={items}
        mediaBudget={proposal.media_budget}
        commitmentMonths={proposal.commitment_months}
        globalDiscountPercent={proposal.global_discount_percent}
        showList={proposal.show_list_prices}
        vatRate={vatRate}
        rounding={rounding}
        token={mode === "client" ? token : undefined}
        interactive={interactive}
      />

      {proposal.terms && (
        <section className="card">
          <h2>תנאים</h2>
          <p className="prose-he text-[15px]">{proposal.terms}</p>
        </section>
      )}

      {proposal.status === "accepted" ? (
        <section className="card border-green-300 bg-green-50">
          <h2 className="!text-green-800">ההצעה אושרה</h2>
          <p>
            נחתמה על ידי {proposal.signer_name}
            {proposal.signer_role ? `, ${proposal.signer_role}` : ""} בתאריך {dateHe(proposal.accepted_at)}. תודה! ניצור קשר בקרוב לתיאום הצעדים הבאים.
          </p>
        </section>
      ) : (
        <ClientActions token={mode === "client" ? token : undefined} canSign={interactive} addressForm={proposal.address_form} />
      )}

      <p className="no-print text-center text-xs text-muted">
        {companyName} · {proposal.number}
      </p>
    </article>
  );
}
