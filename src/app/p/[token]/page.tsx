import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadByToken } from "@/lib/public-data";
import { toPublic } from "@/lib/public-proposal";
import { LIVE_STATUSES, OPEN_STATUSES } from "@/lib/types";
import { isExpired } from "@/lib/format";
import { ProposalDocument } from "@/components/proposal/ProposalDocument";
import { ViewTracker } from "@/components/proposal/ViewTracker";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadByToken(token);
  return { title: data ? data.proposal.title : "הצעת מחיר", robots: { index: false, follow: false } };
}

export default async function ClientProposalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadByToken(token);
  if (!data) notFound();
  const { proposal, items, settings } = data;

  if (!LIVE_STATUSES.includes(proposal.status)) {
    return (
      <Notice title="ההצעה בעדכון">
        אנחנו מעדכנים את ההצעה ונשלח לכם אותה מחדש בקרוב. לשאלות אפשר לפנות לאיש הקשר שלכם ב{settings.company_name}.
      </Notice>
    );
  }
  const expired = proposal.status !== "accepted" && (proposal.status === "expired" || isExpired(proposal.valid_until));
  if (expired)
    return (
      <Notice title="תוקף ההצעה הסתיים">
        ההצעה הייתה בתוקף עד {proposal.valid_until}. נשמח לחדש אותה – פנו לאיש הקשר שלכם ב{settings.company_name}.
      </Notice>
    );
  if (proposal.status === "rejected")
    return <Notice title="ההצעה סגורה">ההצעה סומנה כסגורה. לשאלות אפשר לפנות לאיש הקשר שלכם ב{settings.company_name}.</Notice>;

  const pub = toPublic(proposal, items);
  return (
    <>
      <ViewTracker token={token} />
      <ProposalDocument
        proposal={pub.proposal}
        items={pub.items}
        companyName={settings.company_name}
        vatRate={settings.vat_rate}
        rounding={settings.rounding}
        mode="client"
        token={token}
        interactive={OPEN_STATUSES.includes(proposal.status)}
      />
    </>
  );
}

function Notice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md space-y-2 text-center">
        <h1 className="text-lg font-bold">{title}</h1>
        <p className="text-sm text-muted">{children}</p>
      </div>
    </main>
  );
}
