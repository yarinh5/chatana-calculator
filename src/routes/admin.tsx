import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus, Mail, Trash2, Eye, Ban, CheckCircle2, KeyRound, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { AppTopBar } from "@/components/AppTopBar";
import {
  adminListUsers, adminCreateUser, adminInviteUser,
  adminToggleActive, adminDeleteUser, adminResetPassword, adminGetUserEventId,
} from "@/lib/admin.functions";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";

export const Route = createFileRoute("/admin")({
  component: AdminPage,
  validateSearch: (s: Record<string, unknown>) => ({ view: (s.view as string) || "" }),
});

type AdminUser = {
  id: string; email: string; full_name: string | null;
  is_active: boolean; created_at: string; last_login: string | null;
  roles: string[]; isAdmin: boolean;
};

function AdminPage() {
  const { session, isAdmin, loading } = useAuth();
  const navigate = useNavigate();
  const { view } = Route.useSearch();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [viewEventId, setViewEventId] = useState<string | null>(null);
  const [viewUser, setViewUser] = useState<AdminUser | null>(null);

  const listFn = useServerFn(adminListUsers);
  const createFn = useServerFn(adminCreateUser);
  const inviteFn = useServerFn(adminInviteUser);
  const toggleFn = useServerFn(adminToggleActive);
  const deleteFn = useServerFn(adminDeleteUser);
  const resetFn = useServerFn(adminResetPassword);
  const getEventFn = useServerFn(adminGetUserEventId);

  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: "/login", replace: true }); return; }
    if (!isAdmin) { navigate({ to: "/", replace: true }); return; }
    refresh();
  }, [session, isAdmin, loading]);

  useEffect(() => {
    if (!view || !isAdmin) { setViewEventId(null); setViewUser(null); return; }
    (async () => {
      const u = users.find((x) => x.id === view);
      if (u) setViewUser(u);
      try {
        const ev = await getEventFn({ data: { userId: view } });
        if (ev) setViewEventId(ev.id);
      } catch (e: any) { toast.error(e.message); }
    })();
  }, [view, users, isAdmin]);

  async function refresh() {
    setBusy(true);
    try { setUsers(await listFn() as AdminUser[]); }
    catch (e: any) { toast.error(e.message); }
    setBusy(false);
  }

  async function toggleActive(u: AdminUser) {
    try {
      await toggleFn({ data: { userId: u.id, isActive: !u.is_active } });
      toast.success(u.is_active ? "החשבון הושהה" : "החשבון הופעל");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`למחוק לצמיתות את ${u.email}? כל הנתונים יימחקו.`)) return;
    try {
      await deleteFn({ data: { userId: u.id } });
      toast.success("המשתמש נמחק");
      refresh();
    } catch (e: any) { toast.error(e.message); }
  }

  async function resetPass(u: AdminUser) {
    try {
      await resetFn({ data: { email: u.email } });
      toast.success("לינק איפוס נשלח");
    } catch (e: any) { toast.error(e.message); }
  }

  if (loading || !isAdmin) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="size-8 animate-spin text-rose" /></div>;
  }

  // Viewing user's dashboard
  if (view && viewEventId) {
    return (
      <WeddingCalculator
        eventId={viewEventId}
        readOnly
        topBar={<AppTopBar />}
        title={`צפייה בחשבון של ${viewUser?.full_name ?? viewUser?.email ?? "משתמש"}`}
        subtitle="מצב צפייה בלבד — אינך יכול לערוך"
        banner={
          <div className="no-print bg-gold/20 text-foreground">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 text-xs md:px-6">
              <span>👁 אתה צופה בחשבון של {viewUser?.email}</span>
              <Link to="/admin" search={{ view: "" }} className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 font-medium hover:bg-secondary">
                <ArrowRight size={12} /> חזרה לניהול
              </Link>
            </div>
          </div>
        }
      />
    );
  }

  const active = users.filter((u) => u.is_active).length;
  const suspended = users.length - active;

  return (
    <div className="min-h-screen bg-background">
      <AppTopBar />
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        <h1 className="font-display text-3xl text-foreground">ניהול משתמשים</h1>

        <div className="mt-6 grid grid-cols-3 gap-3">
          <Stat label="סה״כ משתמשים" value={users.length} />
          <Stat label="פעילים" value={active} tone="success" />
          <Stat label="מושהים" value={suspended} tone="danger" />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button onClick={() => setShowAdd(true)} className="inline-flex items-center gap-2 rounded-full bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep">
            <UserPlus size={15} /> הוסף משתמש
          </button>
          <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">
            <Mail size={15} /> שלח הזמנה
          </button>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl bg-card ring-1 ring-border">
          {busy ? (
            <div className="p-8 text-center text-muted-foreground"><Loader2 className="mx-auto size-6 animate-spin" /></div>
          ) : (
            <table className="min-w-full text-right text-sm">
              <thead className="bg-secondary/50 text-xs font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">שם</th>
                  <th className="px-3 py-3">מייל</th>
                  <th className="px-3 py-3">תפקיד</th>
                  <th className="px-3 py-3">סטטוס</th>
                  <th className="px-3 py-3">נוצר</th>
                  <th className="px-3 py-3 text-center">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <td className="px-3 py-3 font-medium">{u.full_name ?? "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground" dir="ltr">{u.email}</td>
                    <td className="px-3 py-3">
                      {u.isAdmin ? <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold">אדמין</span>
                                 : <span className="text-xs text-muted-foreground">משתמש</span>}
                    </td>
                    <td className="px-3 py-3">
                      {u.is_active ? <span className="text-success">✅ פעיל</span> : <span className="text-destructive">⛔ מושהה</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("he-IL")}</td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center gap-1">
                        <Link to="/admin" search={{ view: u.id }} title="צפה" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"><Eye size={14} /></Link>
                        <button title="אפס סיסמא" onClick={() => resetPass(u)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"><KeyRound size={14} /></button>
                        {!u.isAdmin && (
                          <>
                            <button title={u.is_active ? "השהה" : "הפעל"} onClick={() => toggleActive(u)} className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                              {u.is_active ? <Ban size={14} /> : <CheckCircle2 size={14} />}
                            </button>
                            <button title="מחק" onClick={() => deleteUser(u)} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"><Trash2 size={14} /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">אין משתמשים עדיין</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={() => { setShowAdd(false); refresh(); }} createFn={createFn} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onSent={() => { setShowInvite(false); toast.success("ההזמנה נשלחה"); refresh(); }} inviteFn={inviteFn} />}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "success" | "danger" }) {
  const color = tone === "success" ? "text-success" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl ${color}`}>{value}</div>
    </div>
  );
}

function AddUserModal({ onClose, onCreated, createFn }: { onClose: () => void; onCreated: () => void; createFn: any }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await createFn({ data: { fullName, email, password } }); toast.success("המשתמש נוצר"); onCreated(); }
    catch (err: any) { toast.error(err.message); }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} title="הוסף משתמש חדש">
      <form onSubmit={submit} className="space-y-3">
        <input required placeholder="שם מלא" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <input required type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <input required type="text" placeholder="סיסמא (לפחות 6)" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <div className="flex justify-start gap-2 pt-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50">{busy ? "יוצר…" : "צור חשבון"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">ביטול</button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose, onSent, inviteFn }: { onClose: () => void; onSent: () => void; inviteFn: any }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try { await inviteFn({ data: { email } }); onSent(); }
    catch (err: any) { toast.error(err.message); }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} title="הזמן משתמש במייל">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted-foreground">המוזמן יקבל מייל עם לינק להשלמת הרשמה.</p>
        <input required type="email" placeholder="מייל" value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm" />
        <div className="flex justify-start gap-2 pt-2">
          <button type="submit" disabled={busy} className="rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50">{busy ? "שולח…" : "שלח הזמנה"}</button>
          <button type="button" onClick={onClose} className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary">ביטול</button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl ring-1 ring-border" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-xl">{title}</h3>
        {children}
      </div>
    </div>
  );
}
