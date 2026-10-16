import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/data";
import { ROLE_LABEL } from "@/lib/types";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSessionProfile();
  if (!user) redirect("/login");
  if (!profile) redirect("/no-access");
  const admin = profile.role === "admin";

  return (
    <div className="min-h-screen">
      <header className="no-print border-b border-line bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/proposals" className="font-bold text-brand">
            הצעות מחיר
          </Link>
          <nav className="flex flex-wrap gap-4 text-sm">
            <Link href="/proposals" className="hover:text-brand">
              ההצעות
            </Link>
            <Link href="/proposals/new" className="hover:text-brand">
              הצעה חדשה
            </Link>
            <Link href="/catalog" className="hover:text-brand">
              קטלוג שירותים
            </Link>
            {admin && (
              <Link href="/settings" className="hover:text-brand">
                הגדרות
              </Link>
            )}
          </nav>
          <div className="ms-auto flex items-center gap-3 text-sm">
            <span className="text-muted">
              {profile.full_name || profile.email} · {ROLE_LABEL[profile.role]}
            </span>
            <SignOutButton className="btn btn-sm" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
