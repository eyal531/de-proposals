"use client";

import { useEffect, useState } from "react";
import type { AddressForm } from "@/lib/greeting";
import type { Section } from "@/lib/types";

interface AnalyzeRequest {
  proposalId: string;
  companyName: string | null;
  website: string | null;
  callNotes: string;
  addressForm: AddressForm;
  serviceIds: string[];
  serviceNames: string[];
}

const STEPS = ["קורא את האתר של הלקוח…", "בודק תשתית מדידה ודרכי יצירת קשר…", "מחפש מתחרים בגוגל…", "כותב את הניתוח בעברית…"];

export function AiPanel(props: {
  enabled: boolean;
  locked: boolean;
  proposalId: string;
  hasAi: boolean;
  pendingAi: number;
  request: () => AnalyzeRequest;
  onSections: (s: Section[]) => void;
  onApproveAll: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<{ notes: string[]; siteError: string | null; pagesRead: number; cost: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!busy) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 12000);
    return () => clearInterval(t);
  }, [busy]);

  if (!props.enabled)
    return (
      <div className="rounded-xl border border-dashed border-line p-3 text-sm text-muted">
        ניתוח AI של העסק (אתגרים, תחרות, הזדמנויות ואסטרטגיה) יופעל אחרי חיבור מפתח Anthropic ב-Vercel.
      </div>
    );

  async function run() {
    const req = props.request();
    if (!req.website && !req.callNotes.trim()) {
      setErr("כדי שהניתוח יהיה אישי, הזינו את אתר הלקוח או הערות מהשיחה.");
      return;
    }
    setErr(null);
    setInfo(null);
    setBusy(true);
    const started = Date.now();
    try {
      const res = await fetch("/api/ai/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req) });
      const json = await res.json().catch(() => ({ error: "התשובה מהשרת לא תקינה" }));
      if (!res.ok) throw new Error(json.error ?? "שגיאה");
      props.onSections(json.sections as Section[]);
      setInfo({ notes: json.notes ?? [], siteError: json.siteError, pagesRead: json.pagesRead, cost: json.usage?.costUsd ?? 0, seconds: Math.round((Date.now() - started) / 1000) });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-brand/30 bg-brand-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1">
          <div className="font-medium">ניתוח העסק ב-AI</div>
          <div className="text-xs text-muted">קורא את אתר הלקוח, מחפש מתחרים וכותב: הבנת העסק, ממצאים מהאתר, אתגרים, תחרות, הזדמנויות, אסטרטגיה ו-30 הימים הראשונים.</div>
        </div>
        <button className="btn btn-primary" disabled={busy || props.locked} onClick={run}>
          {busy ? "מנתח…" : props.hasAi ? "הרצה מחדש" : "יצירת ניתוח"}
        </button>
      </div>
      {busy && (
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
          {STEPS[step]} <span className="text-xs text-muted">(בדרך כלל דקה עד שתיים)</span>
        </div>
      )}
      {err && <p className="text-sm text-red-700">{err}</p>}
      {info && (
        <div className="space-y-1 text-sm">
          <p className="text-green-800">
            הניתוח נוסף כטיוטה ({info.pagesRead ? `נקראו ${info.pagesRead} עמודים מהאתר` : "בלי קריאת האתר"}, {info.seconds} שניות, עלות כ-${info.cost.toFixed(2)}). עברו על המקטעים, ערכו ואשרו. השינויים יישמרו בלחיצה על &quot;שמירה&quot;.
          </p>
          {info.siteError && <p className="text-amber-800">לא הצלחנו לקרוא את האתר: {info.siteError}. הניתוח מבוסס על חיפוש ברשת ועל הערות השיחה.</p>}
          {info.notes.length > 0 && (
            <div className="rounded-lg bg-white p-2">
              <div className="text-xs font-medium">הערות פנימיות מה-AI (לא מוצגות ללקוח):</div>
              <ul className="list-disc ps-5 text-xs text-muted">
                {info.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {props.pendingAi > 0 && !busy && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-amber-800">{props.pendingAi === 1 ? "מקטע AI אחד ממתין לאישור" : `${props.pendingAi} מקטעי AI ממתינים לאישור`}. לא ניתן לשלוח את ההצעה לפני שכל מקטעי ה-AI אושרו או הוסתרו.</span>
          <button className="btn btn-sm" disabled={props.locked} onClick={props.onApproveAll}>
            עברתי על הכל – אשר את כולם
          </button>
        </div>
      )}
    </div>
  );
}

const PRESETS: { key: string; label: string }[] = [
  { key: "shorter", label: "קצר" },
  { key: "longer", label: "הרחב" },
  { key: "professional", label: "מקצועי יותר" },
  { key: "warmer", label: "חם יותר" },
  { key: "direct", label: "ישיר יותר" },
];

export function RewriteBar({ title, text, addressForm, onText }: { title: string; text: string; addressForm: AddressForm; onText: (t: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [prev, setPrev] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function rewrite(preset: string) {
    setBusy(preset);
    setErr(null);
    try {
      const res = await fetch("/api/ai/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, text, preset, instruction: custom, addressForm }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "שגיאה");
      setPrev(text);
      onText(json.text);
      if (preset === "custom") setCustom("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "שגיאה");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">שכתוב:</span>
      {PRESETS.map((p) => (
        <button key={p.key} type="button" className="btn btn-sm" disabled={!!busy} onClick={() => rewrite(p.key)}>
          {busy === p.key ? "…" : p.label}
        </button>
      ))}
      <input
        className="input w-56 py-1 text-sm"
        placeholder="הוראה חופשית, למשל: הדגש את הוואטסאפ"
        value={custom}
        onChange={(e) => setCustom(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && custom.trim() && rewrite("custom")}
      />
      <button type="button" className="btn btn-sm" disabled={!!busy || !custom.trim()} onClick={() => rewrite("custom")}>
        {busy === "custom" ? "…" : "בצע"}
      </button>
      {prev !== null && !busy && (
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => {
            onText(prev);
            setPrev(null);
          }}
        >
          ביטול השינוי
        </button>
      )}
      {err && <span className="text-xs text-red-700">{err}</span>}
    </div>
  );
}
