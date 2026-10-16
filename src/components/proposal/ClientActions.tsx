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
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1d2433";
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
        <section className="card no-print space-y-4">
          <h2>אישור ההצעה</h2>
          {done ? (
            <p className="text-green-700">תודה! ההצעה אושרה.</p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">שם מלא</label>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <label className="label">תפקיד</label>
                  <input className="input" value={role} onChange={(e) => setRole(e.target.value)} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">חתימה</label>
                  <button type="button" className="text-xs text-muted underline" onClick={clear}>
                    ניקוי
                  </button>
                </div>
                <canvas ref={canvas} width={600} height={160} className="h-32 w-full touch-none rounded-xl border border-dashed border-line bg-white" />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                <span>
                  {pick(addressForm, { plural: "קראנו ואנו מאשרים", male: "קראתי ואני מאשר", female: "קראתי ואני מאשרת" })} את ההצעה, את הבחירות שסומנו ואת התנאים.
                </span>
              </label>
              {err && <p className="text-sm text-red-700">{err}</p>}
              <button className="btn btn-primary w-full sm:w-auto" disabled={busy || !agree || name.trim().length < 2 || !hasInk} onClick={sign}>
                {busy ? "שומר…" : "אישור וחתימה"}
              </button>
            </>
          )}
        </section>
      )}

      <section className="card no-print space-y-3">
        <h2>{pick(addressForm, { plural: "יש לכם שאלה?", male: "יש לך שאלה?", female: "יש לך שאלה?" })}</h2>
        {qSent ? (
          <p className="text-sm text-green-700">השאלה נשלחה. נחזור אליכם בהקדם.</p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <textarea className="textarea min-h-12 flex-1" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="כתבו כאן ונחזור אליכם" />
            <button className="btn self-end" onClick={ask} disabled={!question.trim()}>
              שליחה
            </button>
          </div>
        )}
        <button className="btn btn-sm" onClick={() => window.print()}>
          הורדה / הדפסה כ-PDF
        </button>
      </section>
    </>
  );
}
