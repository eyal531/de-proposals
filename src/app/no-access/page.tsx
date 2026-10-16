import { SignOutButton } from "@/components/SignOutButton";

export default function NoAccess() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md space-y-3 text-center">
        <h1 className="text-lg font-bold">אין לך הרשאה למערכת</h1>
        <p className="text-sm text-muted">
          המערכת פתוחה לעובדי החברה בלבד. אם נכנסת עם כתובת פרטית, התנתק ונסה שוב עם כתובת העבודה, או בקש ממנהל המערכת להוסיף את
          הדומיין שלך בהגדרות.
        </p>
        <SignOutButton />
      </div>
    </main>
  );
}
