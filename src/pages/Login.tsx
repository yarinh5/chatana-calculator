import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AuthShell } from "@/components/auth/AuthShell";
import { GoogleButton, AuthDivider } from "@/components/auth/GoogleButton";
import { authFallbackPath, redirectParam, safeInviteRedirect } from "@/lib/safe-redirect";

export default function Login() {
  const navigate = useNavigate();
  const { session, isAdmin, loading } = useAuth();
  const [params] = useSearchParams();
  const reason = params.get("reason") ?? "";
  const safeRedirect = safeInviteRedirect(params.get("redirect"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate(safeRedirect || authFallbackPath(isAdmin), { replace: true });
  }, [session, isAdmin, loading, navigate, safeRedirect]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials" ? "מייל או סיסמא שגויים" : error.message,
      );
      return;
    }
    toast.success("ברוך הבא!");
  }

  return (
    <AuthShell title="ברוכים הבאים" subtitle="התחברו לחשבון שלכם">
      {reason === "suspended" && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          ⛔ החשבון שלך הושהה. אנא צור קשר עם המנהל.
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            כתובת מייל
          </label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full min-h-11 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
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
            className="w-full min-h-11 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose focus:ring-2 focus:ring-rose/20"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full min-h-11 rounded-lg bg-rose px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50"
        >
          {busy ? "מתחבר…" : "התחבר"}
        </button>
      </form>
      <AuthDivider />
      <GoogleButton redirectTo={safeRedirect ?? undefined} />
      <div className="mt-5 flex justify-between text-xs text-muted-foreground">
        <Link to="/forgot-password" className="hover:text-rose">
          שכחת סיסמא?
        </Link>
        <Link to={`/register${redirectParam(safeRedirect)}`} className="hover:text-rose">
          עדיין אין לך חשבון? הירשם
        </Link>
      </div>
    </AuthShell>
  );
}
