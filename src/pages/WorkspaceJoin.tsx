import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";

export default function WorkspaceJoin() {
  const { token } = useParams<{ token: string }>();
  const { session, loading } = useAuth();
  const { selectWorkspace, refresh } = useWorkspace();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("מקבלים את ההזמנה...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("קישור ההזמנה חסר או לא תקין.");
      return;
    }
    if (loading) return;
    if (!session) {
      sessionStorage.setItem("wb-pending-invite-token", token);
      navigate(`/login?redirect=/workspace/join/${encodeURIComponent(token)}`, { replace: true });
      return;
    }

    let cancelled = false;
    (async () => {
      setStatus("loading");
      setMessage("מחברים אותך לסביבת העבודה...");
      const { data, error } = await supabase.rpc("accept_event_invitation", { _token: token });
      if (cancelled) return;
      if (error || !data?.[0]?.event_id) {
        setStatus("error");
        setMessage(error?.message ?? "לא הצלחנו לקבל את ההזמנה.");
        return;
      }
      sessionStorage.removeItem("wb-pending-invite-token");
      await refresh();
      selectWorkspace(data[0].event_id);
      setStatus("success");
      setMessage("ההזמנה התקבלה בהצלחה.");
      setTimeout(() => navigate("/dashboard", { replace: true }), 900);
    })();
    return () => {
      cancelled = true;
    };
  }, [loading, navigate, refresh, selectWorkspace, session, token]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="w-full max-w-md rounded-2xl bg-card p-8 text-center shadow-sm ring-1 ring-border">
        {status === "loading" && <Loader2 className="mx-auto size-8 animate-spin text-rose" />}
        {status === "success" && <CheckCircle2 className="mx-auto size-9 text-success" />}
        {status === "error" && <XCircle className="mx-auto size-9 text-destructive" />}
        <h1 className="mt-4 font-display text-2xl text-foreground">הזמנת Workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        {status === "error" && (
          <Link
            to="/dashboard"
            className="mt-6 inline-flex min-h-10 items-center rounded-xl bg-rose px-4 text-sm font-semibold text-white hover:bg-rose/90"
          >
            חזרה למערכת
          </Link>
        )}
      </div>
    </div>
  );
}
