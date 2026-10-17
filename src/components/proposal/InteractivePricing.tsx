"use client";

import { useMemo, useState } from "react";
import { applySelection, computePricing } from "@/lib/pricing/engine";
import type { MediaBudgetLine, PricingItemInput } from "@/lib/pricing/types";
import type { PublicItem } from "@/lib/public-proposal";
import { ils } from "@/lib/format";

export function InteractivePricing(props: {
  items: PublicItem[];
  mediaBudget: number | null;
  mediaBudgets: MediaBudgetLine[];
  mediaFeePercent: number;
  commitmentMonths: number;
  globalDiscountPercent: number;
  showList: boolean;
  vatRate: number;
  rounding: number;
  token?: string;
  interactive: boolean;
}) {
  const [inputs, setInputs] = useState<PricingItemInput[]>(() =>
    props.items.map((i) => ({ id: i.id, name: i.name, model: i.pricing_model, params: i.params, quantity: i.quantity, discount: i.discount, kind: i.kind, groupKey: i.group_key, selected: i.selected })),
  );
  const [error, setError] = useState<string | null>(null);

  const result = useMemo(
    () =>
      computePricing(inputs, {
        vatRate: props.vatRate,
        rounding: props.rounding,
        mediaBudget: props.mediaBudget,
        mediaBudgets: props.mediaBudgets,
        mediaFeePercent: props.mediaFeePercent,
        commitmentMonths: props.commitmentMonths,
        globalDiscountPercent: props.globalDiscountPercent,
      }),
    [inputs, props.vatRate, props.rounding, props.mediaBudget, props.mediaBudgets, props.mediaFeePercent, props.commitmentMonths, props.globalDiscountPercent],
  );
  const line = (id: string) => result.lines.find((l) => l.id === id)!;
  const t = result.totals;
  const pool = result.mediaPool;

  async function toggle(id: string, selected: boolean) {
    if (!props.interactive) return;
    const prev = inputs;
    setInputs(applySelection(inputs, id, selected));
    if (!props.token) return; // preview mode: local only
    setError(null);
    const res = await fetch(`/api/p/${props.token}/select`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ itemId: id, selected }) });
    if (!res.ok) {
      setInputs(prev);
      setError("לא הצלחנו לשמור את הבחירה. נסו שוב.");
    }
  }

  const isMgmt = (i: PricingItemInput) => i.model === "hybrid_max";
  const mgmtRequired = inputs.filter((i) => i.kind === "required" && isMgmt(i));
  const otherRequired = inputs.filter((i) => i.kind === "required" && !isMgmt(i));
  const optional = inputs.filter((i) => i.kind === "optional");
  const groups = Array.from(new Set(inputs.filter((i) => i.kind === "alternative").map((i) => i.groupKey ?? i.id)));
  const mediaRows = props.mediaBudgets.filter((m) => m.amount > 0);

  const Price = ({ id, muted }: { id: string; muted?: boolean }) => {
    const l = line(id);
    return (
      <div className={`pdoc-price ${muted ? "is-muted" : ""}`}>
        {props.showList && l.discountAmount > 0 && <s className="num">{ils(l.listPrice)}</s>}
        <span className="num">{ils(l.net)}</span>
        <small>{l.billing === "monthly" ? "לחודש" : "חד-פעמי"}</small>
      </div>
    );
  };
  const Note = ({ id }: { id: string }) => {
    const item = inputs.find((i) => i.id === id)!;
    const l = line(id);
    const milestones = item.params.milestones?.filter((m) => m.percent > 0) ?? [];
    const text = [
      item.model === "hybrid_max" ? "" : l.explanation,
      milestones.length ? `תשלומים: ${milestones.map((m) => `${m.label} ${m.percent}%`).join(", ")}` : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return text ? <div className="pdoc-note">{text}</div> : null;
  };

  return (
    <div className="pdoc-invest">
      {mediaRows.length > 0 && (
        <div className="pdoc-block pdoc-media">
          <div className="pdoc-block-head">
            <h3>תקציב מדיה חודשי</h3>
            <span>משולם ישירות לפלטפורמות הפרסום ואינו חלק מהתשלום אלינו</span>
          </div>
          {mediaRows.map((m) => (
            <div key={m.id} className="pdoc-row">
              <div>{m.platform}</div>
              <div className="num">{ils(m.amount)}</div>
            </div>
          ))}
          <div className="pdoc-row pdoc-row-total">
            <div>סה״כ מדיה בחודש</div>
            <div className="num">{ils(t.mediaTotal)}</div>
          </div>
        </div>
      )}

      {(mgmtRequired.length > 0 || pool) && (
        <div className="pdoc-block">
          <div className="pdoc-block-head">
            <h3>ניהול הקמפיינים</h3>
          </div>
          {mgmtRequired.map((i) => (
            <div key={i.id} className="pdoc-row">
              <div>
                <div className="pdoc-row-title">{i.name}</div>
                <Note id={i.id} />
              </div>
              <Price id={i.id} muted={pool?.determinedBy === "percent"} />
            </div>
          ))}
          {pool && (
            <div className="pdoc-fee">
              <div className="pdoc-fee-rule">
                עמלת הניהול היא הגבוה מבין סך דמי הניהול ({ils(pool.fixedSum)}) לבין {pool.percent}% מסך תקציב המדיה ({ils(pool.percentValue)})
              </div>
              <div className="pdoc-fee-value">
                <span className="num">{ils(pool.fee)}</span>
                <small>לחודש</small>
              </div>
            </div>
          )}
        </div>
      )}

      {otherRequired.length > 0 && (
        <div className="pdoc-block">
          <div className="pdoc-block-head">
            <h3>{mgmtRequired.length || pool ? "שירותים נוספים" : "השירותים"}</h3>
          </div>
          {otherRequired.map((i) => (
            <div key={i.id} className="pdoc-row">
              <div>
                <div className="pdoc-row-title">{i.name}</div>
                <Note id={i.id} />
              </div>
              <Price id={i.id} />
            </div>
          ))}
        </div>
      )}

      {groups.map((g) => {
        const alts = inputs.filter((i) => i.kind === "alternative" && (i.groupKey ?? i.id) === g);
        return (
          <fieldset key={g} className="pdoc-block">
            <legend className="pdoc-block-head">
              <h3>{props.interactive ? "בחרו את המסלול" : "מסלולים"}</h3>
            </legend>
            {alts.map((i) => (
              <label key={i.id} className={`pdoc-choice ${i.selected ? "is-on" : ""}`}>
                <input type="radio" name={`g-${g}`} checked={i.selected} disabled={!props.interactive} onChange={() => toggle(i.id, true)} />
                <div>
                  <div className="pdoc-row-title">{i.name}</div>
                  <Note id={i.id} />
                </div>
                <Price id={i.id} />
              </label>
            ))}
          </fieldset>
        );
      })}

      {optional.length > 0 && (
        <fieldset className="pdoc-block">
          <legend className="pdoc-block-head">
            <h3>אפשר להוסיף</h3>
          </legend>
          {optional.map((i) => (
            <label key={i.id} className={`pdoc-choice ${i.selected ? "is-on" : ""}`}>
              <input type="checkbox" checked={i.selected} disabled={!props.interactive} onChange={(e) => toggle(i.id, e.target.checked)} />
              <div>
                <div className="pdoc-row-title">{i.name}</div>
                <Note id={i.id} />
              </div>
              <Price id={i.id} />
            </label>
          ))}
        </fieldset>
      )}

      {error && <p className="pdoc-error">{error}</p>}

      <div className="pdoc-totals">
        {t.monthlyNet > 0 && (
          <div>
            <div className="pdoc-totals-label">תשלום חודשי</div>
            <div className="pdoc-totals-value num">{ils(t.monthlyNet)}</div>
            <div className="pdoc-totals-sub">
              לפני מע״מ · {ils(t.monthlyWithVat)} כולל מע״מ
              {props.commitmentMonths > 1 ? ` · התחייבות ל-${props.commitmentMonths} חודשים` : ""}
            </div>
            {t.globalDiscountMonthly > 0 && <div className="pdoc-totals-sub">כולל הנחה של {props.globalDiscountPercent}%</div>}
          </div>
        )}
        {t.oneTimeNet > 0 && (
          <div>
            <div className="pdoc-totals-label">תשלום חד-פעמי</div>
            <div className="pdoc-totals-value num">{ils(t.oneTimeNet)}</div>
            <div className="pdoc-totals-sub">לפני מע״מ · {ils(t.oneTimeWithVat)} כולל מע״מ</div>
            {t.globalDiscountOneTime > 0 && <div className="pdoc-totals-sub">כולל הנחה של {props.globalDiscountPercent}%</div>}
          </div>
        )}
        {t.mediaTotal > 0 && (
          <div className="pdoc-totals-media">
            <div className="pdoc-totals-label">ובנוסף, תקציב מדיה</div>
            <div className="pdoc-totals-value is-small num">{ils(t.mediaTotal)}</div>
            <div className="pdoc-totals-sub">לחודש, ישירות לפלטפורמות</div>
          </div>
        )}
      </div>
      {pool && <p className="pdoc-note">עמלת הניהול בפועל מחושבת בכל חודש לפי תקציב המדיה שהוצא בפועל.</p>}
    </div>
  );
}
