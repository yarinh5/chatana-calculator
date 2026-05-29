import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/AuthShell";

export const Route = createFileRoute("/reset-password")({ component: ResetPage });

function ResetPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) { toast.error("הסיסמאות אינן תואמות"); return; }
    if (password.length < 6) { toast.error("הסיסמא חייבת לפחות 6 תווים"); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("הסיסמא עודכנה");
    navigate({ to: "/", replace: true });
  }

  return (
    <AuthShell title="איפוס סיסמא" subtitle="הגדר סיסמא חדשה">
      <form onSubmit={submit} className="space-y-4">
        <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="סיסמא חדשה" dir="ltr"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose" />
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="אישור סיסמא" dir="ltr"
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:border-rose" />
        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-rose px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50">
          {busy ? "שומר…" : "עדכן סיסמא"}
        </button>
      </form>
    </AuthShell>
  );
}
