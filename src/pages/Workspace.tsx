import { useCallback, useMemo, useState } from "react";
import { Copy, Loader2, RefreshCw, Send, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppTopBar } from "@/components/AppTopBar";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useWorkspace } from "@/hooks/useWorkspace";

type WorkspaceRole = Database["public"]["Enums"]["workspace_role"];
type MemberRow = Database["public"]["Functions"]["list_workspace_members"]["Returns"][number];
type InvitationRow =
  Database["public"]["Functions"]["list_pending_event_invitations"]["Returns"][number];

const roleLabels: Record<WorkspaceRole, string> = {
  editor: "עורך מלא",
  viewer: "צפייה בלבד",
  guest_manager: "ניהול מוזמנים",
  event_manager: "ניהול יום האירוע",
};

const roles = Object.keys(roleLabels) as WorkspaceRole[];

export default function Workspace() {
  const { activeWorkspace, activeEventId, loading, error, can, isOwner, refresh } = useWorkspace();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<WorkspaceRole>("viewer");
  const [busy, setBusy] = useState(false);

  const allowed = isOwner || can("workspace_manage");
  const workspaceQuery = useQuery({
    queryKey: ["workspace-management", activeEventId],
    enabled: !!activeEventId && allowed,
    queryFn: async () => {
      if (!activeEventId) return { members: [], invitations: [] };
      const [membersResult, invitationsResult] = await Promise.all([
        supabase.rpc("list_workspace_members", { _event_id: activeEventId }),
        supabase.rpc("list_pending_event_invitations", { _event_id: activeEventId }),
      ]);
      if (membersResult.error) throw membersResult.error;
      if (invitationsResult.error) throw invitationsResult.error;
      return {
        members: (membersResult.data ?? []) as MemberRow[],
        invitations: (invitationsResult.data ?? []) as InvitationRow[],
      };
    },
  });

  const reload = useCallback(async () => {
    await Promise.all([workspaceQuery.refetch(), refresh()]);
  }, [refresh, workspaceQuery]);

  const createInvite = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeEventId || !email.trim()) return;
    setBusy(true);
    try {
      const { data, error: inviteError } = await supabase.rpc("create_event_invitation", {
        _email: email.trim(),
        _event_id: activeEventId,
        _role: role,
      });
      if (inviteError) throw inviteError;
      const token = data?.[0]?.token;
      if (token) await copyInvite(token);
      setEmail("");
      toast.success("ההזמנה נוצרה והקישור הועתק");
      await reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "יצירת הזמנה נכשלה");
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async (token: string) => {
    await navigator.clipboard.writeText(`${window.location.origin}/workspace/join/${token}`);
  };

  const invitations = workspaceQuery.data?.invitations ?? [];
  const members = workspaceQuery.data?.members ?? [];

  const content = useMemo(() => {
    if (loading)
      return <State icon={<Loader2 className="animate-spin" />} title="טוען סביבת עבודה" />;
    if (error) {
      return (
        <State
          title="שגיאה בטעינת סביבת העבודה"
          action={<Button onClick={() => void refresh()}>נסה שוב</Button>}
        />
      );
    }
    if (!activeWorkspace) return <State title="אין סביבת עבודה להצגה" />;
    if (!allowed) return <State title="אין לך הרשאה לניהול השיתוף באירוע הזה" />;
    return null;
  }, [activeWorkspace, allowed, error, loading, refresh]);

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppTopBar />
      <main className="mx-auto max-w-5xl px-4 py-8 md:px-6">
        {content ?? (
          <div className="space-y-6">
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="font-display text-3xl text-foreground">ניהול שיתוף</h1>
                <p className="text-sm text-muted-foreground">
                  {activeWorkspace?.event_name} · הזמנות והרשאות עבודה
                </p>
              </div>
              <Button variant="outline" onClick={() => void reload()}>
                <RefreshCw size={15} /> רענון
              </Button>
            </header>

            <form
              onSubmit={createInvite}
              className="grid gap-3 rounded-2xl bg-card p-4 ring-1 ring-border sm:grid-cols-[1fr_180px_auto]"
            >
              <input
                required
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@example.com"
                dir="ltr"
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
              />
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as WorkspaceRole)}
                className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
              >
                {roles.map((nextRole) => (
                  <option key={nextRole} value={nextRole}>
                    {roleLabels[nextRole]}
                  </option>
                ))}
              </select>
              <Button disabled={busy} type="submit">
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                שלח הזמנה
              </Button>
            </form>

            <Section title="חברי Workspace">
              {workspaceQuery.isLoading ? (
                <Loader />
              ) : members.length === 0 ? (
                <Empty text="אין חברים משותפים עדיין." />
              ) : (
                members.map((member) => (
                  <div
                    key={member.member_id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">
                        {member.full_name ?? "ללא שם"}
                      </div>
                      <div className="truncate text-xs text-muted-foreground" dir="ltr">
                        {member.email}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={member.role}
                        onChange={async (event) => {
                          const { error: updateError } = await supabase.rpc(
                            "update_event_member_role",
                            {
                              _member_id: member.member_id,
                              _role: event.target.value as WorkspaceRole,
                            },
                          );
                          if (updateError) toast.error("עדכון התפקיד נכשל");
                          else {
                            toast.success("התפקיד עודכן");
                            await reload();
                          }
                        }}
                        className="min-h-9 rounded-lg border border-input bg-background px-2 text-xs"
                      >
                        {roles.map((nextRole) => (
                          <option key={nextRole} value={nextRole}>
                            {roleLabels[nextRole]}
                          </option>
                        ))}
                      </select>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          if (!confirm("להסיר את המשתמש מסביבת העבודה?")) return;
                          const { error: removeError } = await supabase.rpc("remove_event_member", {
                            _member_id: member.member_id,
                          });
                          if (removeError) toast.error("הסרת המשתמש נכשלה");
                          else {
                            toast.success("המשתמש הוסר");
                            await reload();
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Section>

            <Section title="הזמנות פתוחות">
              {workspaceQuery.isLoading ? (
                <Loader />
              ) : invitations.length === 0 ? (
                <Empty text="אין הזמנות פתוחות." />
              ) : (
                invitations.map((invitation) => (
                  <div
                    key={invitation.invitation_id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-0"
                  >
                    <div>
                      <div className="text-sm font-semibold" dir="ltr">
                        {invitation.email}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {roleLabels[invitation.role]} · תוקף עד{" "}
                        {new Date(invitation.expires_at).toLocaleDateString("he-IL")}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { data, error: reissueError } = await supabase.rpc(
                            "reissue_event_invitation",
                            {
                              _invitation_id: invitation.invitation_id,
                            },
                          );
                          if (reissueError) toast.error("יצירת קישור חדש נכשלה");
                          else if (data?.[0]?.token) {
                            await copyInvite(data[0].token);
                            toast.success("קישור חדש הועתק");
                            await reload();
                          }
                        }}
                      >
                        <Copy size={14} /> קישור חדש
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const { error: revokeError } = await supabase.rpc(
                            "revoke_event_invitation",
                            {
                              _invitation_id: invitation.invitation_id,
                            },
                          );
                          if (revokeError) toast.error("ביטול ההזמנה נכשל");
                          else {
                            toast.success("ההזמנה בוטלה");
                            await reload();
                          }
                        }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </Section>
          </div>
        )}
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <h2 className="font-display text-xl text-foreground">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function State({
  title,
  icon,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
      {icon && <div className="mx-auto mb-3 flex justify-center text-rose">{icon}</div>}
      <h1 className="font-display text-2xl text-foreground">{title}</h1>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex min-h-24 items-center justify-center">
      <Loader2 className="size-5 animate-spin text-rose" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
      {text}
    </div>
  );
}
