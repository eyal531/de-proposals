import Link from "next/link";
import { requireMember } from "@/lib/data";
import { MODEL_LABEL } from "@/lib/pricing/meta";
import { listPrice } from "@/lib/pricing/engine";
import { ils } from "@/lib/format";
import type { Service } from "@/lib/types";

export default async function CatalogPage() {
  const { supabase, profile } = await requireMember();
  const { data } = await supabase.from("services").select("*").order("sort");
  const services = (data ?? []) as Service[];
  const categories = Array.from(new Set(services.map((s) => s.category)));
  const admin = profile.role === "admin";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">קטלוג שירותים</h1>
        {admin && (
          <Link href="/catalog/new" className="btn btn-primary ms-auto">
            + שירות חדש
          </Link>
        )}
      </div>
      {categories.map((c) => (
        <div key={c} className="card overflow-x-auto p-0">
          <div className="border-b border-line px-4 py-2 font-bold">{c}</div>
          <table className="grid">
            <thead>
              <tr>
                <th>שירות</th>
                <th>מודל תמחור</th>
                <th>מחיר בסיס</th>
                <th>רצפה</th>
                <th>התחייבות מינ׳</th>
                <th>סטטוס</th>
              </tr>
            </thead>
            <tbody>
              {services
                .filter((s) => s.category === c)
                .map((s) => (
                  <tr key={s.id}>
                    <td>
                      {admin ? (
                        <Link className="font-medium text-brand hover:underline" href={`/catalog/${s.id}`}>
                          {s.name}
                        </Link>
                      ) : (
                        <span className="font-medium">{s.name}</span>
                      )}
                      <div className="text-xs text-muted">{s.client_name}</div>
                    </td>
                    <td className="text-sm">{MODEL_LABEL[s.pricing_model]}</td>
                    <td className="text-sm">{listPrice(s.pricing_model, s.params, 1, null).explanation || ils(listPrice(s.pricing_model, s.params, 1, null).list)}</td>
                    <td className="num text-sm">{s.floor_price ? ils(s.floor_price) : "—"}</td>
                    <td className="text-sm">{s.min_commitment_months ? `${s.min_commitment_months} ח׳` : "—"}</td>
                    <td>{s.active ? <span className="badge badge-green">פעיל</span> : <span className="badge badge-gray">מושבת</span>}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-muted">המחירים בקטלוג ההתחלתי הם דוגמאות. עדכנו אותם לפני השימוש.</p>
    </div>
  );
}
