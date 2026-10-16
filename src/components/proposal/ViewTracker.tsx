"use client";

import { useEffect } from "react";

/** Records one view per browser session (spec 12, FR-80). */
export function ViewTracker({ token }: { token: string }) {
  useEffect(() => {
    const key = `viewed:${token}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // storage unavailable – still record
    }
    fetch(`/api/p/${token}/view`, { method: "POST" }).catch(() => {});
  }, [token]);
  return null;
}
