"use client";

import { useEffect, useRef, useState } from "react";
import { pick, type AddressForm } from "@/lib/greeting";

export function ClientActions({ token, canSign, addressForm }: { token?: string; canSign: boolean; addressForm: AddressForm }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [qSent, setQSent] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    const pos = (e: PointerEvent) => {
      const r = c.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * c.width) / r.width, y: ((e.clientY - r.top) * c.height) / r.height };
    };
    const down = (e: PointerEvent) => {
      drawing.current = true;
      c.setPointerCapture(e.pointerId);
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      setHasInk(true);
    };
    const up = () => (drawing.current = false);
    c.addEventListener("pointerdown", down);
    c.addEventListener("pointermove", move);
    c.addEventListener("pointerup", up);
    c.addEventListener("pointerleave", up);
    return () => {
      c.removeEventListener("pointerdown", down);
      c.removeEventListener("pointermove", move);
      c.removeEventListener("pointerup", up);
      c.removeEventListener("pointerleave", up);
    };
  }, [canSign]);

  const clear = () => {
    const c = canvas.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  async function sign() {
    if (!token) return setErr("בתצוגה המקדימה לא ניתן לחתום.");
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/p/${token}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, role, agree, signature: hasInk ? canvas.current?.toDataURL("image/png") : null }),
    });
    setBusy(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => window.location.reload(), 1200);
    } else setErr((await res.json().catch(() => ({})))?.error ?? "שגיאה בשמירת האישור");
  }

  async function ask() {
    if (!token || !question.trim()) return;
    const res = await fetch(`/api/p/${token}/question`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: question }) });
    if (res.ok) {
      setQSent(true);
      setQuestion("");
    }
  }

  return (
    <>
      {canSign && (
        <section className="pdoc-section no-print" id="approve">
          <h2 className="pdoc-h2">אישור ההצעה</h2>
          <div className="pdoc-section-body">
            {done ? (
              <p className="pdoc-success">תודה! ההצעה אושרה.</p>
            ) : (
              <div className="pdoc-sign">
                <div className="pdoc-sign-fields">
                  <label>
                    <span>שם מלא</span>
                    <input className="pdoc-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
                  </label>
                  <label>
                    <span>תפקיד</span>
                    <input className="pdoc-input" value={role} onChange={(e) => setRole(e.target.value)} autoComplete="organization-title" />
                  </label>
                </div>
                <div className="pdoc-sign-pad">
                  <canvas ref={canvas} width={900} height={220} aria-label="אזור חתימה" />
                  <div className="pdoc-sign-line">
                    <span>חתימה</span>
                    <button type="button" onClick={clear}>
                      ניקוי
                    </button>
                  </div>
                </div>
                <label className="pdoc-agree">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    {pick(addressForm, { plural: "קראנו ואנו מאשרים", male: "קראתי ואני מאשר", female: "קראתי ואני מאשרת" })} את ההצעה, את הבחירות שסומנו ואת התנאים.
                  </span>
                </label>
                {err && <p className="pdoc-error">{err}</p>}
                <button className="pdoc-btn" disabled={busy || !agree || name.trim().length < 2 || !hasInk} onClick={sign}>
                  {busy ? "שומר…" : "אישור וחתימה"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="pdoc-section no-print">
        <h2 className="pdoc-h2">{pick(addressForm, { plural: "יש לכם שאלה?", male: "יש לך שאלה?", female: "יש לך שאלה?" })}</h2>
        <div className="pdoc-section-body">
          {qSent ? (
            <p className="pdoc-success">השאלה נשלחה. נחזור אליכם בהקדם.</p>
          ) : (
            <div className="pdoc-ask">
              <textarea className="pdoc-input" rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="כתבו כאן ונחזור אליכם" />
              <button className="pdoc-btn is-ghost" onClick={ask} disabled={!question.trim()}>
                שליחת השאלה
              </button>
            </div>
          )}
          <button className="pdoc-link" onClick={() => window.print()}>
            שמירה כ-PDF / הדפסה
          </button>
        </div>
      </section>
    </>
  );
}
