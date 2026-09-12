import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";

function inviteErrorMessage(message?: string) {
  const text = message ?? "";
  if (/expired/i.test(text)) return "קישור ההזמנה פג.";
  if (/revoked/i.test(text)) return "ההזמנה בוטלה.";
  if (/already|accepted|used/i.test(text)) return "ההזמנה כבר נוצלה.";
  if (/email|mismatch/i.test(text)) return "כתובת המייל אינה תואמת להזמנה.";
  if (/inactive|suspended/i.test(text)) return "החשבון אינו פעיל.";
  if (/token|invalid|not found/i.test(text)) return "קישור ההזמנה לא תקין.";
  if (/network|fetch|timeout/i.test(text)) return "שגיאת תקשורת. נסו שוב.";
  return "לא ניתן לקבל את ההזמנה.";
}

function isNetworkError(message?: string) {
  return /network|fetch|timeout/i.test(message ?? "");
}

export default function WorkspaceJoin() {
  const { token } = useParams<{ token: string }>();
  const { session, loading } = useAuth();
  const { selectWorkspace, refresh } = useWorkspace();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("מקבלים את ההזמנה...");
  const [canRetry, setCanRetry] = useState(false);
  const acceptedRef = useRef<string | null>(null);

  const acceptInvitation = useCallback(async () => {
    if (!token || !session?.user) return;
    const requestKey = `${session.user.id}:${token}`;
    if (acceptedRef.current === requestKey) return;
    acceptedRef.current = requestKey;
    setStatus("loading");
    setCanRetry(false);
    setMessage("מחברים אותך לסביבת העבודה...");
    const { data, error } = await supabase.rpc("accept_event_invitation", { _token: token });
    if (error || !data?.[0]?.event_id) {
      const network = isNetworkError(error?.message);
      if (network) acceptedRef.current = null;
      setStatus("error");
      setCanRetry(network);
      setMessage(inviteErrorMessage(error?.message));
      return;
    }
    await refresh();
    selectWorkspace(data[0].event_id);
    setStatus("success");
    setMessage("ההזמנה התקבלה בהצלחה.");
    setTimeout(() => navigate("/dashboard", { replace: true }), 900);
  }, [navigate, refresh, selectWorkspace, session?.user, token]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("קישור ההזמנה חסר או לא תקין.");
      return;
    }
    if (loading) return;
    if (!session) {
      navigate(`/login?redirect=/workspace/join/${encodeURIComponent(token)}`, { replace: true });
      return;
    }
    void acceptInvitation();
  }, [acceptInvitation, loading, navigate, session, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
        {status === "loading" && <Loader2 className="mx-auto size-8 animate-spin text-rose" />}
        {status === "success" && <CheckCircle2 className="mx-auto size-9 text-success" />}
        {status === "error" && <XCircle className="mx-auto size-9 text-destructive" />}
        <h1 className="mt-4 font-display text-2xl text-foreground">הזמנת Workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            {canRetry && (
              <button
                type="button"
                onClick={() => void acceptInvitation()}
                className="inline-flex min-h-10 items-center justify-center rounded-xl bg-rose px-4 text-sm font-semibold text-white hover:bg-rose/90"
              >
                נסו שוב
              </button>
            )}
            <Link
              to="/dashboard"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-foreground hover:bg-secondary"
            >
              חזרה למערכת
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
