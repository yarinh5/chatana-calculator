import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  }

  return (
    <AuthShell title="שכחת סיסמא?" subtitle="נשלח לך מייל לאיפוס">
      {sent ? (
        <div className="text-center text-sm text-muted-foreground">
          ✉️ מייל נשלח אל {email}. בדוק את תיבת הדואר שלך.
          <div className="mt-4"><Link to="/login" className="text-rose hover:underline">חזרה להתחברות</Link></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="המייל שלך" dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose" />
          <button type="submit" disabled={busy}
            className="w-full rounded-lg bg-rose px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50">
            {busy ? "שולח…" : "שלח לינק לאיפוס"}
          </button>
          <div className="text-center text-xs"><Link to="/login" className="text-muted-foreground hover:text-rose">חזרה להתחברות</Link></div>
        </form>
      )}
    </AuthShell>
  );
}
