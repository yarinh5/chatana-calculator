import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";
import { redirectParam, safeInviteRedirect } from "@/lib/safe-redirect";

export default function Register() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  const safeRedirect = safeInviteRedirect(params.get("redirect"));
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const [confirmationSent, setConfirmationSent] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate(safeRedirect ?? "/dashboard", { replace: true });
  }, [session, loading, navigate, safeRedirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("הסיסמאות אינן תואמות");
      return;
    }
    if (password.length < 6) {
      toast.error("הסיסמא חייבת לפחות 6 תווים");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}${safeRedirect ?? "/dashboard"}`,
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message || "ההרשמה נכשלה");
      return;
    }
    if (data.session) {
      toast.success("נרשמת בהצלחה");
      navigate(safeRedirect ?? "/dashboard", { replace: true });
      return;
    }
    setConfirmationSent(true);
  }

  if (confirmationSent) {
    return (
      <AuthShell
        title="בדקו את המייל"
        subtitle="שלחנו אליכם מייל לאימות. לאחר האימות תחזרו להזמנה."
      >
        <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          אם לא מצאתם את המייל, בדקו גם בתיקיית הספאם. לאחר האימות תוכלו להמשיך מאותו קישור הזמנה.
        </div>
        <Link
          to={`/login${redirectParam(safeRedirect)}`}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-rose px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
        >
          חזרה להתחברות
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="הרשמה" subtitle="צרו חשבון חדש בחינם">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">שם מלא</label>
          <input
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">מייל</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">סיסמא</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            אישור סיסמא
          </label>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 rounded-lg bg-rose px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50"
        >
          {busy ? "יוצר חשבון…" : "צור חשבון"}
        </button>
      </form>
      <AuthDivider />
      <GoogleButton label="הירשם עם Google" redirectTo={safeRedirect ?? undefined} />
      <div className="mt-5 text-center text-xs text-muted-foreground">
        כבר רשום?{" "}
        <Link to={`/login${redirectParam(safeRedirect)}`} className="text-rose hover:underline">
          התחבר
        </Link>
      </div>
    </AuthShell>
  );
}
