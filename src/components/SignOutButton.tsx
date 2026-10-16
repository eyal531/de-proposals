"use client";

import { createClient } from "@/lib/supabase/browser";

export function SignOutButton({ className = "btn" }: { className?: string }) {
  return (
    <button
      className={className}
      onClick={async () => {
        await createClient().auth.signOut();
        window.location.href = "/login";
      }}
    >
      התנתקות
    </button>
  );
}
