"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ParamsEditor } from "@/components/ParamsEditor";
import { computePricing, usesMediaBudget } from "@/lib/pricing/engine";
import { checkApprovals, LEVEL_LABEL } from "@/lib/pricing/approvals";
import { KIND_LABEL, MODEL_LABEL, pricingContext, toPricingInput, usesQuantity } from "@/lib/pricing/meta";
import type { ItemKind, MediaBudgetLine, PricingModel, PricingParams } from "@/lib/pricing/types";
import { buildGreeting, type AddressForm, type Recipient } from "@/lib/greeting";
import { dateTimeHe, ils, isExpired } from "@/lib/format";
import { STATUS_COLOR, STATUS_LABEL, type Approval, type Proposal, type ProposalEvent, type ProposalItem, type Section, type Service, type Settings, type UserRole } from "@/lib/types";
import { decideApproval, deleteProposal, duplicateProposal, extendValidity, requestApproval, saveProposal, sendProposal, setProposalStatus, type SavePayload } from "../actions";

type EditItem = Omit<ProposalItem, "proposal_id" | "sort">;

const EVENT_LABEL: Record<string, string> = {
  created: "נוצרה",
  saved: "נשמרה",
  approval_requested: "נשלחה לאישור",
  approved: "אושרה",
  changes_requested: "הוחזרה לתיקון",
  sent: "נשלחה ללקוח",
  resent: "עודכנה ונשלחה מחדש",
  viewed: "הלקוח צפה",
  selection: "הלקוח שינה בחירה",
  question: "הלקוח שאל שאלה",
  accepted: "הלקוח אישר וחתם",
  rejected: "נדחתה",
  cancelled: "בוטלה",
  validity_extended: "תוקף הוארך",
};

const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tmp-${Math.random()}`);

export function ProposalEditor(props: {
  proposal: Proposal;
  items: ProposalItem[];
  services: Service[];
  settings: Settings;
  approvals: Approval[];
  events: ProposalEvent[];
  role: UserRole;
  names: Record<string, string>;
  siteUrl: string;
}) {
  const { services, settings, role } = props;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  const p0 = props.proposal;
  const [title, setTitle] = useState(p0.title);
  const [recipients, setRecipients] = useState<Recipient[]>(p0.recipients.length ? p0.recipients : [{ name: "", role: "", email: "" }]);
  const [companyName, setCompanyName] = useState(p0.company_name ?? "");
  const [addressForm, setAddressForm] = useState<AddressForm>(p0.address_form);
  const [website, setWebsite] = useState(p0.website ?? "");
  const [callNotes, setCallNotes] = useState(p0.call_notes);
  const [intro, setIntro] = useState(p0.intro);
  const [sections, setSections] = useState<Section[]>(p0.sections ?? []);
  const [terms, setTerms] = useState(p0.terms);
  const [mediaBudget] = useState<number | null>(p0.media_budget === null ? null : Number(p0.media_budget));
  const [mediaRows, setMediaRows] = useState<MediaBudgetLine[]>((p0.media_budgets ?? []).map((m) => ({ ...m, amount: Number(m.amount) || 0 })));
  const [mediaFeePercent, setMediaFeePercent] = useState(Number(p0.media_fee_percent ?? settings.default_media_fee_percent ?? 20));
  const [commitment, setCommitment] = useState(Number(p0.commitment_months));
  const [globalDiscount, setGlobalDiscount] = useState(Number(p0.global_discount_percent));
  const [showList, setShowList] = useState(p0.show_list_prices);
  const [validUntil, setValidUntil] = useState(p0.valid_until ?? "");
  const [internalNotes, setInternalNotes] = useState(p0.internal_notes);
  const [items, setItems] = useState<EditItem[]>(props.items.map(({ proposal_id: _a, sort: _b, ...rest }) => (void _a, void _b, rest)));
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [addId, setAddId] = useState("");

  const mark = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setDirty(true);
  };

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);
  const calc = useMemo(() => {
    const inputs = items.map((it, i) => toPricingInput({ ...it, proposal_id: p0.id, sort: i }, byId));
    const ctx = pricingContext(
      { media_budget: mediaRows.length ? null : mediaBudget, media_budgets: mediaRows, media_fee_percent: mediaFeePercent, commitment_months: commitment, global_discount_percent: globalDiscount },
      settings,
    );
    const pricing = computePricing(inputs, ctx);
    return { pricing, approval: checkApprovals(inputs, ctx, pricing, settings.approval_rules) };
  }, [items, mediaBudget, mediaRows, mediaFeePercent, commitment, globalDiscount, settings, byId, p0.id]);
  const lineOf = (id: string) => calc.pricing.lines.find((l) => l.id === id);

  const greeting = buildGreeting({ recipients, companyName });
  const locked = ["accepted", "rejected", "cancelled"].includes(p0.status);
  const hasMedia = items.some((i) => usesMediaBudget(i.pricing_model));
  const pendingApproval = props.approvals.find((a) => a.decision === "pending");
  const canDecide = pendingApproval && (role === "admin" || (role === "approver" && pendingApproval.level === "manager"));
  const clientUrl = `${props.siteUrl}/p/${p0.public_token}`;
  const live = ["sent", "viewed", "negotiation", "accepted", "rejected"].includes(p0.status);

  const updateItem = (id: string, patch: Partial<EditItem>) => {
    setItems((its) => its.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    setDirty(true);
  };
  const moveItem = (id: string, dir: -1 | 1) => {
    setItems((its) => {
      const i = its.findIndex((x) => x.id === id);
      const j = i + dir;
      if (j < 0 || j >= its.length) return its;
      const copy = [...its];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    setDirty(true);
  };
  const addItem = () => {
    if (!addId) return;
    let it: EditItem;
    if (addId === "custom") {
      it = { id: newId(), service_id: null, name: "שירות מותאם", description: "", deliverables: [], pricing_model: "one_time", params: { amount: 0 }, quantity: 1, discount: null, kind: "required", group_key: null, selected: true, is_custom: true };
    } else {
      const s = byId.get(addId);
      if (!s) return;
      it = { id: newId(), service_id: s.id, name: s.client_name, description: s.description, deliverables: s.deliverables, pricing_model: s.pricing_model, params: structuredClone(s.params ?? {}), quantity: 1, discount: null, kind: "required", group_key: null, selected: true, is_custom: false };
    }
    setItems((its) => [...its, it]);
    setOpenItem(it.id);
    setAddId("");
    setDirty(true);
  };

  function payload(): SavePayload {
    return {
      id: p0.id,
      title,
      company_name: companyName || null,
      recipients: recipients.filter((r) => r.name.trim()).map((r) => ({ name: r.name, role: r.role ?? "", email: r.email ?? "" })),
      address_form: addressForm,
      website: website || null,
      call_notes: callNotes,
      intro,
      sections,
      terms,
      media_budget: mediaRows.length ? mediaRows.reduce((a, m) => a + (Number(m.amount) || 0), 0) : mediaBudget,
      media_budgets: mediaRows.map((m) => ({ ...m, amount: Number(m.amount) || 0 })),
      media_fee_percent: mediaFeePercent,
      commitment_months: commitment,
      global_discount_percent: globalDiscount,
      show_list_prices: showList,
      valid_until: validUntil || null,
      internal_notes: internalNotes,
      items: items.map((i) => ({ ...i, quantity: Number(i.quantity) || 1, params: i.params as Record<string, unknown> })),
    };
  }

  const run = (fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, okText: string, after?: (r: Record<string, unknown>) => void) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (!r.ok) setMsg({ kind: "err", text: r.error ?? "שגיאה" });
      else {
        setMsg({ kind: r.warning ? "warn" : "ok", text: (r.warning as string) || okText });
        after?.(r);
        router.refresh();
      }
    });

  const save = (then?: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>, thenText?: string, after?: (r: Record<string, unknown>) => void) =>
    start(async () => {
      setMsg(null);
      const r = await saveProposal(payload());
      if (!r.ok) return setMsg({ kind: "err", text: r.error });
      setDirty(false);
      if (!then) {
        setMsg({ kind: r.warning ? "warn" : "ok", text: r.warning ?? "נשמר" });
        return router.refresh();
      }
      const r2 = await then();
      if (!r2.ok) setMsg({ kind: "err", text: r2.error ?? "שגיאה" });
      else {
        setMsg(r2.warning ? { kind: "warn", text: r2.warning as string } : { kind: "ok", text: (r2.message as string) ?? thenText ?? "בוצע" });
        after?.(r2);
      }
      router.refresh();
    });

  const t = calc.pricing.totals;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* header */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="num text-sm text-muted">{p0.number}</span>
          <span className={`badge ${STATUS_COLOR[p0.status]}`}>{STATUS_LABEL[p0.status]}</span>
          {isExpired(p0.valid_until) && live && p0.status !== "accepted" && <span className="badge badge-gray">פג תוקף</span>}
          {dirty && <span className="text-xs text-amber-700">יש שינויים שלא נשמרו</span>}
        </div>
        <input className="input text-xl font-bold" value={title} onChange={(e) => mark(setTitle)(e.target.value)} disabled={locked} />

        {/* recipients */}
        <section className="card space-y-3">
          <h2 className="font-bold">פנייה ופרטי לקוח</h2>
          {recipients.map((r, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <input className="input" placeholder="שם" value={r.name} disabled={locked} onChange={(e) => mark(setRecipients)(recipients.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <input className="input" placeholder="תפקיד" value={r.role ?? ""} disabled={locked} onChange={(e) => mark(setRecipients)(recipients.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
              <input className="input" dir="ltr" placeholder="email" value={r.email ?? ""} disabled={locked} onChange={(e) => mark(setRecipients)(recipients.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} />
              <button className="btn btn-sm btn-danger" disabled={locked || recipients.length === 1} onClick={() => mark(setRecipients)(recipients.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          {recipients.length < 3 && !locked && (
            <button className="btn btn-sm" onClick={() => mark(setRecipients)([...recipients, { name: "", role: "", email: "" }])}>
              + נמען
            </button>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <label className="label">חברה</label>
              <input className="input" value={companyName} disabled={locked} onChange={(e) => mark(setCompanyName)(e.target.value)} />
            </div>
            <div>
              <label className="label">אתר</label>
              <input className="input" dir="ltr" value={website} disabled={locked} onChange={(e) => mark(setWebsite)(e.target.value)} />
            </div>
            <div>
              <label className="label">לשון פנייה</label>
              <select className="select" value={addressForm} disabled={locked} onChange={(e) => mark(setAddressForm)(e.target.value as AddressForm)}>
                <option value="plural">רבים</option>
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
          </div>
          {greeting ? (
            <div className="rounded-lg bg-brand-soft p-3 text-sm">
              {greeting.map((l, i) => (
                <div key={i} className={i ? "font-medium" : ""}>
                  {l}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-amber-700">לא הוזנו שם או חברה – בלוק &quot;לכבוד&quot; לא יוצג.</p>
          )}
        </section>

        {/* pricing */}
        <section className="card space-y-4">
          <h2 className="font-bold">שירותים ותמחור</h2>

          <MediaBudgetsEditor
            rows={mediaRows}
            locked={locked}
            show={hasMedia || mediaRows.length > 0}
            onChange={(rows) => mark(setMediaRows)(rows)}
          />

          <div className="space-y-2">
            {items.map((it, idx) => {
              const line = lineOf(it.id);
              const open = openItem === it.id;
              const svc = it.service_id ? byId.get(it.service_id) : undefined;
              const flagged = calc.approval.reasons.some((r) => r.itemId === it.id);
              return (
                <div key={it.id} className={`rounded-xl border ${flagged ? "border-amber-300 bg-amber-50/40" : "border-line"} p-3`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex flex-col">
                      <button className="text-xs text-muted hover:text-ink" disabled={locked || idx === 0} onClick={() => moveItem(it.id, -1)} aria-label="העלה">
                        ▲
                      </button>
                      <button className="text-xs text-muted hover:text-ink" disabled={locked || idx === items.length - 1} onClick={() => moveItem(it.id, 1)} aria-label="הורד">
                        ▼
                      </button>
                    </div>
                    <input className="input min-w-48 flex-1 font-medium" value={it.name} disabled={locked} onChange={(e) => updateItem(it.id, { name: e.target.value })} />
                    <select className="select w-28" value={it.kind} disabled={locked} onChange={(e) => updateItem(it.id, { kind: e.target.value as ItemKind, selected: e.target.value === "required" ? true : it.selected })}>
                      {(Object.keys(KIND_LABEL) as ItemKind[]).map((k) => (
                        <option key={k} value={k}>
                          {KIND_LABEL[k]}
                        </option>
                      ))}
                    </select>
                    {it.kind === "alternative" && <input className="input w-28" placeholder="קבוצה" title="חלופות עם אותו שם קבוצה – הלקוח בוחר אחת" value={it.group_key ?? ""} disabled={locked} onChange={(e) => updateItem(it.id, { group_key: e.target.value || null })} />}
                    {it.kind !== "required" && (
                      <label className="flex items-center gap-1 text-xs text-muted">
                        <input type="checkbox" checked={it.selected} disabled={locked} onChange={(e) => updateItem(it.id, { selected: e.target.checked })} />
                        מסומן מראש
                      </label>
                    )}
                    <div className="ms-auto text-left">
                      <div className="num font-bold">{line ? ils(line.net) : "—"}</div>
                      <div className="text-xs text-muted">{line?.billing === "monthly" ? "לחודש" : "חד-פעמי"}</div>
                    </div>
                    <button className="btn btn-sm" onClick={() => setOpenItem(open ? null : it.id)}>
                      {open ? "סגור" : "ערוך"}
                    </button>
                    <button className="btn btn-sm btn-danger" disabled={locked} onClick={() => (setItems(items.filter((x) => x.id !== it.id)), setDirty(true))}>
                      ✕
                    </button>
                  </div>
                  {line && (
                    <div className="mt-1 text-xs text-muted">
                      {line.explanation}
                      {it.pricing_model === "hybrid_max" ? " · נכלל בעמלת ניהול המדיה המאוחדת" : ""}
                      {line.discountAmount > 0 ? ` · מחירון ${ils(line.listPrice)}, הנחה ${ils(line.discountAmount)}` : ""}
                      {it.is_custom ? " · פריט חופשי" : ""}
                    </div>
                  )}
                  {open && (
                    <div className="mt-3 space-y-3 border-t border-line pt-3">
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div>
                          <label className="label">מודל תמחור</label>
                          <select className="select" value={it.pricing_model} disabled={locked} onChange={(e) => updateItem(it.id, { pricing_model: e.target.value as PricingModel })}>
                            {(Object.keys(MODEL_LABEL) as PricingModel[]).map((m) => (
                              <option key={m} value={m}>
                                {MODEL_LABEL[m]}
                              </option>
                            ))}
                          </select>
                        </div>
                        {usesQuantity(it.pricing_model) && (
                          <div>
                            <label className="label">כמות</label>
                            <input className="input num" type="number" min={1} value={it.quantity} disabled={locked} onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) })} />
                          </div>
                        )}
                        <div>
                          <label className="label">הנחה</label>
                          <div className="flex gap-1">
                            <input
                              className="input num"
                              type="number"
                              min={0}
                              value={it.discount?.value ?? ""}
                              disabled={locked}
                              onChange={(e) => updateItem(it.id, { discount: e.target.value === "" || Number(e.target.value) === 0 ? null : { type: it.discount?.type ?? "percent", value: Number(e.target.value) } })}
                            />
                            <select className="select w-20" value={it.discount?.type ?? "percent"} disabled={locked} onChange={(e) => updateItem(it.id, { discount: it.discount ? { ...it.discount, type: e.target.value as "percent" | "amount" } : null })}>
                              <option value="percent">%</option>
                              <option value="amount">₪</option>
                            </select>
                          </div>
                        </div>
                      </div>
                      <ParamsEditor model={it.pricing_model} params={it.params} compact onChange={(params: PricingParams) => updateItem(it.id, { params })} />
                      {svc && (
                        <p className="text-xs text-muted">
                          מחירון: {MODEL_LABEL[svc.pricing_model]}
                          {svc.floor_price ? ` · רצפה ${ils(svc.floor_price)}` : ""}
                          {svc.min_commitment_months ? ` · התחייבות מינימלית ${svc.min_commitment_months} חודשים` : ""}
                        </p>
                      )}
                      <div>
                        <label className="label">תיאור ללקוח</label>
                        <textarea className="textarea" value={it.description} disabled={locked} onChange={(e) => updateItem(it.id, { description: e.target.value })} />
                      </div>
                      <div>
                        <label className="label">מה כלול (שורה לכל תוצר)</label>
                        <textarea className="textarea" value={it.deliverables.join("\n")} disabled={locked} onChange={(e) => updateItem(it.id, { deliverables: e.target.value.split("\n").filter((x, i, a) => x.trim() || i === a.length - 1) })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {calc.pricing.mediaPool && (
            <MediaPoolBox pool={calc.pricing.mediaPool} percent={mediaFeePercent} locked={locked} onPercent={(v) => mark(setMediaFeePercent)(v)} />
          )}

          {!locked && (
            <div className="flex gap-2">
              <select className="select" value={addId} onChange={(e) => setAddId(e.target.value)}>
                <option value="">הוספת שירות…</option>
                {Array.from(new Set(services.filter((s) => s.active).map((s) => s.category))).map((c) => (
                  <optgroup key={c} label={c}>
                    {services
                      .filter((s) => s.active && s.category === c)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </optgroup>
                ))}
                <option value="custom">פריט חופשי (דורש אישור)</option>
              </select>
              <button className="btn" onClick={addItem} disabled={!addId}>
                הוסף
              </button>
            </div>
          )}

          <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-4">
            <div>
              <label className="label">התחייבות (חודשים)</label>
              <input className="input num" type="number" min={1} value={commitment} disabled={locked} onChange={(e) => mark(setCommitment)(Number(e.target.value) || 1)} />
            </div>
            <div>
              <label className="label">הנחה כללית (%)</label>
              <input className="input num" type="number" min={0} max={100} value={globalDiscount} disabled={locked} onChange={(e) => mark(setGlobalDiscount)(Number(e.target.value) || 0)} />
            </div>
            <div>
              <label className="label">בתוקף עד</label>
              <input className="input" type="date" value={validUntil} disabled={locked} onChange={(e) => mark(setValidUntil)(e.target.value)} />
            </div>
            <label className="mt-6 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showList} disabled={locked} onChange={(e) => mark(setShowList)(e.target.checked)} />
              הצג ללקוח מחיר מחירון והנחה
            </label>
          </div>
        </section>

        {/* content */}
        <section className="card space-y-3">
          <h2 className="font-bold">תוכן ההצעה</h2>
          <div>
            <label className="label">פתיח</label>
            <textarea className="textarea min-h-32" value={intro} disabled={locked} onChange={(e) => mark(setIntro)(e.target.value)} />
          </div>
          {sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <input className="input flex-1 font-medium" value={s.title} disabled={locked || s.locked} onChange={(e) => mark(setSections)(sections.map((x) => (x.id === s.id ? { ...x, title: e.target.value, status: x.source === "ai" ? "edited" : x.status } : x)))} />
                {s.locked && <span className="badge badge-gray">נעול</span>}
                {s.source === "ai" && <span className={`badge ${s.status === "approved" ? "badge-green" : "badge-amber"}`}>{s.status === "approved" ? "AI · אושר" : "טיוטת AI"}</span>}
                <label className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={s.visible} disabled={locked} onChange={(e) => mark(setSections)(sections.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)))} />
                  מוצג
                </label>
                <button className="btn btn-sm" disabled={locked || i === 0} onClick={() => mark(setSections)(swap(sections, i, i - 1))}>
                  ▲
                </button>
                <button className="btn btn-sm" disabled={locked || i === sections.length - 1} onClick={() => mark(setSections)(swap(sections, i, i + 1))}>
                  ▼
                </button>
                {s.source === "ai" && s.status !== "approved" && (
                  <button className="btn btn-sm" disabled={locked} onClick={() => mark(setSections)(sections.map((x) => (x.id === s.id ? { ...x, status: "approved" } : x)))}>
                    אשר
                  </button>
                )}
                <button className="btn btn-sm btn-danger" disabled={locked || s.locked} onClick={() => mark(setSections)(sections.filter((x) => x.id !== s.id))}>
                  ✕
                </button>
              </div>
              <textarea className="textarea min-h-28" value={s.body} disabled={locked || s.locked} onChange={(e) => mark(setSections)(sections.map((x) => (x.id === s.id ? { ...x, body: e.target.value, status: x.source === "ai" ? "edited" : x.status } : x)))} />
            </div>
          ))}
          {!locked && (
            <button className="btn btn-sm" onClick={() => mark(setSections)([...sections, { id: newId(), title: "מקטע חדש", body: "", visible: true, source: "manual", status: "approved" }])}>
              + מקטע
            </button>
          )}
          <div>
            <label className="label">תנאים</label>
            <textarea className="textarea min-h-32" value={terms} disabled={locked} onChange={(e) => mark(setTerms)(e.target.value)} />
          </div>
        </section>

        <section className="card space-y-3">
          <h2 className="font-bold">פנימי (לא מוצג ללקוח)</h2>
          <div>
            <label className="label">הערות מהשיחה</label>
            <textarea className="textarea" value={callNotes} disabled={locked} onChange={(e) => mark(setCallNotes)(e.target.value)} />
          </div>
          <div>
            <label className="label">הערות פנימיות</label>
            <textarea className="textarea" value={internalNotes} onChange={(e) => mark(setInternalNotes)(e.target.value)} />
          </div>
        </section>
      </div>

      {/* sidebar */}
      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div className="card space-y-2">
          <h3 className="font-bold">סיכום</h3>
          <Row label="חודשי (לפני מע״מ)" value={ils(t.monthlyNet)} strong />
          {t.globalDiscountMonthly > 0 && <Row label="מתוכו הנחה כללית" value={`-${ils(t.globalDiscountMonthly)}`} />}
          <Row label="חד-פעמי (לפני מע״מ)" value={ils(t.oneTimeNet)} strong />
          {t.globalDiscountOneTime > 0 && <Row label="מתוכו הנחה כללית" value={`-${ils(t.globalDiscountOneTime)}`} />}
          <Row label={`חודשי כולל מע״מ ${settings.vat_rate}%`} value={ils(t.monthlyWithVat)} />
          <Row label="חד-פעמי כולל מע״מ" value={ils(t.oneTimeWithVat)} />
          {t.mediaTotal > 0 && <Row label="תקציב מדיה חודשי (לידיעה)" value={ils(t.mediaTotal)} />}
          <div className="border-t border-line pt-2" />
          <Row label={`ערך התקשרות (${commitment} ח׳)`} value={ils(t.contractValue)} />
          <Row label="הנחה מצטברת" value={`${t.effectiveDiscountPercent.toFixed(1)}%`} />
        </div>

        <div className={`card space-y-2 ${calc.approval.level === "none" ? "" : "border-amber-300"}`}>
          <h3 className="font-bold">בדיקת ספים</h3>
          {calc.approval.level === "none" ? (
            <p className="text-sm text-green-700">בתוך הספים – ניתן לשלוח ללא אישור.</p>
          ) : (
            <>
              <p className="text-sm">
                נדרש אישור: <b>{LEVEL_LABEL[calc.approval.level]}</b>
              </p>
              <ul className="list-disc space-y-1 pe-0 ps-5 text-sm text-muted">
                {calc.approval.reasons.map((r, i) => (
                  <li key={i}>{r.message}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        {pendingApproval && (
          <ApprovalBox approval={pendingApproval} canDecide={!!canDecide} requester={props.names[pendingApproval.requested_by ?? ""] ?? ""} onDecide={(d, note) => run(() => decideApproval(pendingApproval.id, d, note), d === "approved" ? "אושר" : "הוחזר לתיקון")} pending={pending} />
        )}

        <div className="card space-y-2">
          {msg && <p className={`text-sm ${msg.kind === "err" ? "text-red-700" : msg.kind === "warn" ? "text-amber-700" : "text-green-700"}`}>{msg.text}</p>}
          {!locked && (
            <button className="btn btn-primary w-full" disabled={pending} onClick={() => save()}>
              {pending ? "שומר…" : "שמירה"}
            </button>
          )}
          {!locked && calc.approval.level !== "none" && p0.status !== "pending_approval" && (
            <RequestApproval disabled={pending} onSubmit={(note) => save(() => requestApproval(p0.id, note), "נשלח לאישור")} />
          )}
          {!locked && p0.status !== "pending_approval" && (
            <button
              className="btn w-full"
              disabled={pending}
              onClick={() =>
                save(
                  () => sendProposal(p0.id),
                  live ? "עודכן. הלקוח רואה את הגרסה החדשה." : "ההצעה מוכנה לשליחה. הקישור הועתק.",
                  () => navigator.clipboard?.writeText(clientUrl).catch(() => {}),
                )
              }
            >
              {live ? "שמור ועדכן את הלקוח" : "סמן כנשלחה והעתק קישור"}
            </button>
          )}
          <Link href={`/proposals/${p0.id}/preview`} target="_blank" className="btn w-full">
            תצוגה מקדימה
          </Link>
          {live && (
            <div className="space-y-1 rounded-lg bg-slate-50 p-2 text-xs">
              <div className="text-muted">קישור ללקוח:</div>
              <div className="num break-all">{clientUrl}</div>
              <div className="flex gap-1">
                <button className="btn btn-sm" onClick={() => navigator.clipboard?.writeText(clientUrl)}>
                  העתק
                </button>
                <a className="btn btn-sm" target="_blank" rel="noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`${title}\n${clientUrl}`)}`}>
                  וואטסאפ
                </a>
                <a className="btn btn-sm" href={`mailto:${recipients.map((r) => r.email).filter(Boolean).join(",")}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${clientUrl}`)}`}>
                  מייל
                </a>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-1 pt-1">
            <button className="btn btn-sm" disabled={pending} onClick={() => run(() => duplicateProposal(p0.id), "שוכפל", (r) => router.push(`/proposals/${r.id}`))}>
              שכפול
            </button>
            {live && p0.status !== "accepted" && (
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() => {
                  const d = prompt("להאריך תוקף עד (YYYY-MM-DD):", validUntil);
                  if (d) run(() => extendValidity(p0.id, d), "התוקף הוארך");
                }}
              >
                הארכת תוקף
              </button>
            )}
            {!locked && live && (
              <button
                className="btn btn-sm"
                disabled={pending}
                onClick={() => {
                  const reason = prompt("סיבת הדחייה (לדוחות):");
                  if (reason !== null) run(() => setProposalStatus(p0.id, "rejected", reason), "סומנה כנדחתה");
                }}
              >
                סמן כנדחתה
              </button>
            )}
            {!locked && p0.status !== "draft" && (
              <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => confirm("לבטל את ההצעה?") && run(() => setProposalStatus(p0.id, "cancelled"), "בוטלה")}>
                ביטול
              </button>
            )}
            {p0.status === "draft" && (
              <button className="btn btn-sm btn-danger" disabled={pending} onClick={() => confirm("למחוק את הטיוטה?") && run(() => deleteProposal(p0.id), "נמחקה", () => router.push("/proposals"))}>
                מחיקה
              </button>
            )}
          </div>
        </div>

        {p0.signer && (
          <div className="card space-y-1 text-sm">
            <h3 className="font-bold text-green-700">נחתם</h3>
            <div>
              {p0.signer.name}
              {p0.signer.role ? `, ${p0.signer.role}` : ""}
            </div>
            <div className="text-xs text-muted">{dateTimeHe(p0.accepted_at)}</div>
          </div>
        )}

        <div className="card space-y-2">
          <h3 className="font-bold">היסטוריה</h3>
          <ul className="space-y-1 text-sm">
            {props.events.map((e) => (
              <li key={e.id} className="flex justify-between gap-2">
                <span>
                  {EVENT_LABEL[e.type] ?? e.type}
                  {e.actor && props.names[e.actor] ? ` · ${props.names[e.actor]}` : ""}
                  {e.type === "question" && typeof e.meta?.text === "string" ? `: ${e.meta.text}` : ""}
                </span>
                <span className="shrink-0 text-xs text-muted">{dateTimeHe(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
}

function swap<T>(arr: T[], i: number, j: number): T[] {
  const c = [...arr];
  [c[i], c[j]] = [c[j], c[i]];
  return c;
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted">{label}</span>
      <span className={`num ${strong ? "font-bold" : ""}`}>{value}</span>
    </div>
  );
}

function RequestApproval({ onSubmit, disabled }: { onSubmit: (note: string) => void; disabled: boolean }) {
  const [note, setNote] = useState("");
  return (
    <div className="space-y-1 rounded-lg bg-amber-50 p-2">
      <textarea className="textarea min-h-16" placeholder="נימוק לבקשת האישור" value={note} onChange={(e) => setNote(e.target.value)} />
      <button className="btn w-full" disabled={disabled} onClick={() => onSubmit(note)}>
        שמור ושלח לאישור
      </button>
    </div>
  );
}

function ApprovalBox({ approval, canDecide, requester, onDecide, pending }: { approval: Approval; canDecide: boolean; requester: string; onDecide: (d: "approved" | "changes_requested", note: string) => void; pending: boolean }) {
  const [note, setNote] = useState("");
  return (
    <div className="card space-y-2 border-amber-300 bg-amber-50">
      <h3 className="font-bold">ממתין לאישור {LEVEL_LABEL[approval.level]}</h3>
      <p className="text-xs text-muted">
        {requester} · {dateTimeHe(approval.created_at)}
      </p>
      {approval.request_note && <p className="text-sm">&quot;{approval.request_note}&quot;</p>}
      <ul className="list-disc ps-5 text-sm text-muted">
        {approval.reasons.map((r, i) => (
          <li key={i}>{r.message}</li>
        ))}
      </ul>
      {canDecide && (
        <>
          <textarea className="textarea min-h-14" placeholder="הערה (אופציונלי)" value={note} onChange={(e) => setNote(e.target.value)} />
          <div className="flex gap-2">
            <button className="btn btn-primary flex-1" disabled={pending} onClick={() => onDecide("approved", note)}>
              אישור
            </button>
            <button className="btn flex-1" disabled={pending} onClick={() => onDecide("changes_requested", note)}>
              החזר לתיקון
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const PLATFORMS = ["מטא (פייסבוק ואינסטגרם)", "גוגל", "יוטיוב", "טיקטוק", "לינקדאין", "טאבולה / אאוטבריין", "אחר"];

function MediaBudgetsEditor({ rows, onChange, locked, show }: { rows: MediaBudgetLine[]; onChange: (r: MediaBudgetLine[]) => void; locked: boolean; show: boolean }) {
  const total = rows.reduce((a, m) => a + (Number(m.amount) || 0), 0);
  const used = new Set(rows.map((r) => r.platform));
  const add = () => onChange([...rows, { id: newId(), platform: PLATFORMS.find((p) => !used.has(p)) ?? "אחר", amount: 0 }]);
  if (!show)
    return locked ? null : (
      <button className="btn btn-sm" onClick={add}>
        + תקציב מדיה
      </button>
    );
  return (
    <div className="rounded-xl border border-line bg-slate-50 p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <div className="font-medium">תקציבי מדיה חודשיים</div>
        <div className="text-xs text-muted">משולם ישירות לפלטפורמות, לא כלול במחיר</div>
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => (
          <div key={r.id} className="flex gap-2">
            <input
              className="input flex-1"
              list="media-platforms"
              value={r.platform}
              disabled={locked}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
            />
            <input
              className="input num w-36"
              type="number"
              min={0}
              value={r.amount || ""}
              placeholder="₪ לחודש"
              disabled={locked}
              onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) || 0 } : x)))}
            />
            <button className="btn btn-sm btn-danger" disabled={locked} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="הסרה">
              ✕
            </button>
          </div>
        ))}
        <datalist id="media-platforms">
          {PLATFORMS.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <div className="mt-2 flex items-center justify-between">
        {!locked ? (
          <button className="btn btn-sm" onClick={add}>
            + פלטפורמה
          </button>
        ) : (
          <span />
        )}
        <div className="text-sm">
          סה״כ מדיה: <span className="num font-bold">{ils(total)}</span>
        </div>
      </div>
    </div>
  );
}

function MediaPoolBox({ pool, percent, onPercent, locked }: { pool: NonNullable<ReturnType<typeof computePricing>["mediaPool"]>; percent: number; onPercent: (v: number) => void; locked: boolean }) {
  const pctWins = pool.determinedBy === "percent";
  return (
    <div className="rounded-xl border border-brand/30 bg-brand-soft p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="font-medium">עמלת ניהול מדיה</div>
        <label className="ms-auto flex items-center gap-1 text-xs text-muted">
          אחוז מסך המדיה
          <input className="input num w-16 py-1" type="number" min={0} max={100} value={percent} disabled={locked} onChange={(e) => onPercent(Number(e.target.value) || 0)} />%
        </label>
      </div>
      <div className="grid gap-1 sm:grid-cols-3">
        <div className={!pctWins ? "font-bold" : "text-muted"}>
          סך דמי הניהול: <span className="num">{ils(pool.fixedSum)}</span>
        </div>
        <div className={pctWins ? "font-bold" : "text-muted"}>
          {pool.percent}% מסך המדיה ({ils(pool.mediaTotal)}): <span className="num">{ils(pool.percentValue)}</span>
        </div>
        <div className="font-bold">
          העמלה: <span className="num">{ils(pool.fee)}</span> לחודש
        </div>
      </div>
      <div className="mt-1 text-xs text-muted">
        {pctWins ? `האחוז גבוה מסך דמי הניהול, ולכן נוספת השלמה של ${ils(pool.adjustment)}.` : "סך דמי הניהול גבוה מהאחוז, ולכן הוא העמלה."}
        {pool.breakEvenMedia ? ` האחוז מתחיל לקבוע מתקציב מדיה כולל של ${ils(pool.breakEvenMedia)}.` : ""}
      </div>
    </div>
  );
}
