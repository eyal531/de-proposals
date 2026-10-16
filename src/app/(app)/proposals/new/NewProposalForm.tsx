"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { classifyEmail } from "@/lib/email-domain";
import { buildGreeting } from "@/lib/greeting";
import type { AddressForm } from "@/lib/greeting";
import type { Service } from "@/lib/types";
import { createProposal } from "../actions";

const TITLES = ["הצעה לניהול שיווק דיגיטלי", "הצעה לניהול קמפיינים ממומנים", "הצעה לקידום אורגני (SEO)", "הצעה לבניית אתר", "הצעה לליווי וייעוץ דיגיטלי"];

interface R {
  name: string;
  role: string;
  email: string;
}

export function NewProposalForm({ services, freeDomains }: { services: Service[]; freeDomains: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<R[]>([{ name: "", role: "", email: "" }]);
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [websiteTouched, setWebsiteTouched] = useState(false);
  const [addressForm, setAddressForm] = useState<AddressForm>("plural");
  const [titleBase, setTitleBase] = useState(TITLES[0]);
  const [callNotes, setCallNotes] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);

  const emailInfo = useMemo(() => classifyEmail(recipients[0]?.email ?? "", freeDomains.length ? freeDomains : undefined), [recipients, freeDomains]);
  const suggested = emailInfo.kind === "business" ? emailInfo.websiteGuess : null;
  const greeting = buildGreeting({ recipients, companyName });

  const setR = (i: number, patch: Partial<R>) => setRecipients((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const toggle = (id: string) => setServiceIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const categories = Array.from(new Set(services.map((s) => s.category)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createProposal({ recipients, companyName, phone, website: website || (!websiteTouched && suggested) || "", addressForm, titleBase, callNotes, serviceIds });
      if (res.ok) router.push(`/proposals/${res.id}`);
      else setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <section className="card space-y-4">
        <h2 className="font-bold">למי ההצעה</h2>
        {recipients.map((r, i) => (
          <div key={i} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label">שם איש קשר {i > 0 && i + 1}</label>
              <input className="input" value={r.name} onChange={(e) => setR(i, { name: e.target.value })} placeholder="ישראל ישראלי" />
            </div>
            <div>
              <label className="label">תפקיד (אופציונלי)</label>
              <input className="input" value={r.role} onChange={(e) => setR(i, { role: e.target.value })} placeholder='מנכ"ל' />
            </div>
            <div>
              <label className="label">אימייל</label>
              <input className="input" dir="ltr" type="email" value={r.email} onChange={(e) => setR(i, { email: e.target.value })} placeholder="name@company.co.il" />
            </div>
          </div>
        ))}
        {recipients.length < 3 && (
          <button type="button" className="btn btn-sm" onClick={() => setRecipients((rs) => [...rs, { name: "", role: "", email: "" }])}>
            + נמען נוסף
          </button>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">שם החברה</label>
            <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder='אקמה בע"מ' />
          </div>
          <div>
            <label className="label">טלפון</label>
            <input className="input" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label className="label">לשון פנייה</label>
            <select className="select" value={addressForm} onChange={(e) => setAddressForm(e.target.value as AddressForm)}>
              <option value="plural">רבים (אתכם)</option>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>
        </div>
        <div>
          <label className="label">אתר הלקוח</label>
          <input
            className="input"
            dir="ltr"
            value={websiteTouched ? website : website || suggested || ""}
            onChange={(e) => {
              setWebsiteTouched(true);
              setWebsite(e.target.value);
            }}
            placeholder="https://www.company.co.il"
          />
          <p className="mt-1 text-xs text-muted">
            {emailInfo.kind === "business" && !websiteTouched && `זיהינו את האתר ${emailInfo.domain} מכתובת האימייל. אם זה לא האתר של הלקוח, תקנו כאן.`}
            {emailInfo.kind === "personal" && "האימייל פרטי, ולכן לא זוהה אתר. אם יש ללקוח אתר, הזינו אותו כאן."}
          </p>
        </div>
        {greeting && (
          <div className="rounded-lg bg-brand-soft p-3 text-sm">
            <div className="mb-1 text-xs text-muted">כך תופיע הפנייה בהצעה:</div>
            {greeting.map((l, i) => (
              <div key={i} className={i === 0 ? "" : "font-medium"}>
                {l}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">על מה ההצעה</h2>
        <div>
          <label className="label">כותרת</label>
          <select className="select" value={titleBase} onChange={(e) => setTitleBase(e.target.value)}>
            {TITLES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">שם הלקוח יתווסף אוטומטית לכותרת. ניתן לערוך אחר כך.</p>
        </div>
        <div>
          <label className="label">שירותים</label>
          <div className="space-y-3">
            {categories.map((c) => (
              <div key={c}>
                <div className="mb-1 text-xs font-medium text-muted">{c}</div>
                <div className="flex flex-wrap gap-2">
                  {services
                    .filter((s) => s.category === c)
                    .map((s) => (
                      <button type="button" key={s.id} onClick={() => toggle(s.id)} className={`btn btn-sm ${serviceIds.includes(s.id) ? "btn-primary" : ""}`}>
                        {s.name}
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <label className="label">הערות מהשיחה עם הלקוח</label>
          <textarea className="textarea" value={callNotes} onChange={(e) => setCallNotes(e.target.value)} placeholder="מה הלקוח סיפר, מה כואב לו, מה ניסה בעבר, יעדים ותקציב" />
          <p className="mt-1 text-xs text-muted">ישמש בהמשך את ניתוח ה-AI. לא מוצג ללקוח.</p>
        </div>
      </section>

      {error && <p className="text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "יוצר..." : "צור הצעה והמשך לתמחור"}
        </button>
      </div>
    </form>
  );
}
