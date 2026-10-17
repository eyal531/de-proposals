"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ApprovalLevel } from "@/lib/pricing/approvals";
import { LEVEL_LABEL } from "@/lib/pricing/approvals";
import { ROLE_LABEL, type Profile, type Settings, type UserRole } from "@/lib/types";
import { saveSettings, sendTestEmail, updateUser } from "./actions";
import { BrandEditor } from "./BrandEditor";

const LEVELS: ApprovalLevel[] = ["none", "manager", "ceo"];

export function SettingsForm({ settings, users, me }: { settings: Settings; users: Profile[]; me: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; message: string } | null>(null);
  const [s, setS] = useState({
    ...settings,
    allowed: settings.allowed_email_domains.join(", "),
    free: settings.free_email_domains.join(", "),
  });
  const r = s.approval_rules;
  const setRule = (patch: Partial<typeof r>) => setS((x) => ({ ...x, approval_rules: { ...x.approval_rules, ...patch } }));
  const split = (v: string) => v.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);

  function save() {
    start(async () => {
      const res = await saveSettings({
        company_name: s.company_name,
        vat_rate: Number(s.vat_rate),
        rounding: Number(s.rounding),
        default_validity_days: Number(s.default_validity_days),
        default_commitment_months: Number(s.default_commitment_months),
        allowed_email_domains: split(s.allowed),
        free_email_domains: split(s.free),
        default_terms: s.default_terms,
        default_media_fee_percent: Number(s.default_media_fee_percent),
        ai_guidelines: s.ai_guidelines,
        ai_model: s.ai_model,
        brand: s.brand,
        approval_rules: r,
      });
      setMsg(res.ok ? "נשמר" : res.error);
      router.refresh();
    });
  }

  const num = (v: number, on: (n: number) => void) => <input className="input num" type="number" value={v} onChange={(e) => on(Number(e.target.value))} />;
  const lvl = (v: ApprovalLevel, on: (l: ApprovalLevel) => void) => (
    <select className="select" value={v} onChange={(e) => on(e.target.value as ApprovalLevel)}>
      {LEVELS.map((l) => (
        <option key={l} value={l}>
          {LEVEL_LABEL[l]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-2xl font-bold">הגדרות</h1>

      <section className="card grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">שם החברה (מופיע בהצעות)</label>
          <input className="input" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} />
        </div>
        <div>
          <label className="label">מע״מ (%)</label>
          {num(s.vat_rate, (v) => setS({ ...s, vat_rate: v }))}
        </div>
        <div>
          <label className="label">עיגול סכומים (1 = שקלים, 10 = עשרות)</label>
          {num(s.rounding, (v) => setS({ ...s, rounding: v }))}
        </div>
        <div>
          <label className="label">תוקף הצעה ברירת מחדל (ימים)</label>
          {num(s.default_validity_days, (v) => setS({ ...s, default_validity_days: v }))}
        </div>
        <div>
          <label className="label">התחייבות ברירת מחדל (חודשים)</label>
          {num(s.default_commitment_months, (v) => setS({ ...s, default_commitment_months: v }))}
        </div>
      </section>

      <BrandEditor brand={s.brand} onChange={(brand) => setS({ ...s, brand })} />

      <section className="card space-y-3">
        <h2 className="font-bold">עמלת ניהול מדיה</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">אחוז מסך המדיה (ברירת מחדל להצעה חדשה)</label>
            {num(s.default_media_fee_percent, (v) => setS({ ...s, default_media_fee_percent: v }))}
          </div>
          <p className="text-sm text-muted sm:col-span-2 sm:mt-6">
            עמלת הניהול בהצעה = הגבוה מבין סך דמי הניהול של שירותי ניהול המדיה, לבין האחוז הזה מסך תקציבי המדיה בכל הפלטפורמות.
          </p>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">ספי אישור</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">הנחה ללא אישור עד (%)</label>
            {num(r.discountFreeMaxPercent, (v) => setRule({ discountFreeMaxPercent: v }))}
          </div>
          <div>
            <label className="label">הנחה באישור מנהל מכירות עד (%) – מעל: מנכ״ל</label>
            {num(r.discountManagerMaxPercent, (v) => setRule({ discountManagerMaxPercent: v }))}
          </div>
          <div>
            <label className="label">ערך התקשרות שמחייב מנכ״ל (₪, 0 = כבוי)</label>
            {num(r.contractValueCeoThreshold, (v) => setRule({ contractValueCeoThreshold: v }))}
          </div>
          <div>
            <label className="label">פריט חופשי</label>
            {lvl(r.customItemLevel, (v) => setRule({ customItemLevel: v }))}
          </div>
          <div>
            <label className="label">מחיר מתחת לרצפה</label>
            {lvl(r.belowFloorLevel, (v) => setRule({ belowFloorLevel: v }))}
          </div>
          <div>
            <label className="label">סכום קבוע במודל היברידי נמוך מהמחירון</label>
            {lvl(r.hybridBelowCatalogLevel, (v) => setRule({ hybridBelowCatalogLevel: v }))}
          </div>
          <div>
            <label className="label">התחייבות קצרה מהמינימום</label>
            {lvl(r.shortCommitmentLevel, (v) => setRule({ shortCommitmentLevel: v }))}
          </div>
        </div>
        <p className="text-xs text-muted">אישור ברמת &quot;מנהל מכירות&quot; – משתמש בתפקיד מאשר או מנהל מערכת. ברמת &quot;מנכ״ל&quot; – מנהל מערכת בלבד.</p>
      </section>

      <section className="card space-y-3">
        <h2 className="font-bold">דומיינים</h2>
        <div>
          <label className="label">דומיינים של עובדים (מי שנכנס עם כתובת מהם מקבל גישה כאיש מכירות)</label>
          <input className="input" dir="ltr" value={s.allowed} onChange={(e) => setS({ ...s, allowed: e.target.value })} placeholder="digitaleffective.co.il" />
        </div>
        <div>
          <label className="label">ספקי דואר פרטיים (לא מזהים מהם אתר לקוח)</label>
          <textarea className="textarea" dir="ltr" value={s.free} onChange={(e) => setS({ ...s, free: e.target.value })} />
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">הנחיות כתיבה ל-AI</h2>
        <p className="text-sm text-muted">איך הסוכנות כותבת: טון, מילים שאוהבים ושלא, מה תמיד להדגיש. ה-AI ישתמש בזה בכל ניתוח ושכתוב.</p>
        <textarea
          className="textarea min-h-28"
          value={s.ai_guidelines}
          placeholder="לדוגמה: אנחנו כותבים בגובה העיניים, בלי סופרלטיבים. תמיד מדגישים מדידה ושקיפות. לא משתמשים במילה 'מהפכני'."
          onChange={(e) => setS({ ...s, ai_guidelines: e.target.value })}
        />
        <div className="pt-2">
          <label className="label">מנוע ה-AI</label>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="ai_model" checked={s.ai_model === "economy"} onChange={() => setS({ ...s, ai_model: "economy" })} />
              חסכוני (Claude Haiku) – כ-3–5 סנט לניתוח
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="ai_model" checked={s.ai_model === "quality"} onChange={() => setS({ ...s, ai_model: "quality" })} />
              איכותי (Claude Sonnet) – כ-15–25 סנט לניתוח, עברית מלוטשת יותר
            </label>
          </div>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">מיילים</h2>
        <p className="text-sm text-muted">שליחת מייל בדיקה לכתובת שלך, כדי לוודא ששירות המייל (Brevo) מחובר.</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="btn"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await sendTestEmail();
                setEmailMsg(r);
              })
            }
          >
            שליחת מייל בדיקה
          </button>
          {emailMsg && <span className={`text-sm ${emailMsg.ok ? "text-green-700" : "text-red-700"}`}>{emailMsg.message}</span>}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">תנאים ברירת מחדל להצעה חדשה</h2>
        <textarea className="textarea min-h-40" value={s.default_terms} onChange={(e) => setS({ ...s, default_terms: e.target.value })} />
      </section>

      <div className="flex items-center justify-end gap-3">
        {msg && <span className="text-sm text-muted">{msg}</span>}
        <button className="btn btn-primary" disabled={pending} onClick={save}>
          שמירת הגדרות
        </button>
      </div>

      <section className="card overflow-x-auto p-0">
        <div className="border-b border-line px-4 py-2 font-bold">משתמשים</div>
        <table className="grid">
          <thead>
            <tr>
              <th>משתמש</th>
              <th>תפקיד</th>
              <th>פעיל</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="font-medium">{u.full_name || "—"}</div>
                  <div className="num text-xs text-muted">{u.email}</div>
                </td>
                <td>
                  <select
                    className="select w-40"
                    value={u.role}
                    disabled={u.id === me}
                    onChange={(e) =>
                      start(async () => {
                        const res = await updateUser(u.id, { role: e.target.value as UserRole });
                        if (!res.ok) setMsg(res.error);
                        router.refresh();
                      })
                    }
                  >
                    {(Object.keys(ROLE_LABEL) as UserRole[]).map((k) => (
                      <option key={k} value={k}>
                        {ROLE_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="checkbox"
                    checked={u.active}
                    disabled={u.id === me}
                    onChange={(e) =>
                      start(async () => {
                        await updateUser(u.id, { active: e.target.checked });
                        router.refresh();
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-4 py-2 text-xs text-muted">עובדים חדשים מופיעים כאן אחרי הכניסה הראשונה שלהם למערכת.</p>
      </section>
    </div>
  );
}
