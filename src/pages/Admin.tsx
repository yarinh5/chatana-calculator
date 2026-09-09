import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Loader2, UserPlus, Mail, Trash2, Eye, KeyRound, ArrowRight, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppTopBar } from "@/components/AppTopBar";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListUsers,
  adminCreateUser,
  adminInviteUser,
  adminToggleActive,
  adminDeleteUser,
  adminResetPassword,
  adminGetUserEventId,
  adminUpdateUser,
  type AdminUser,
} from "@/lib/admin-api";
import { WeddingCalculator } from "@/components/wedding/WeddingCalculator";
import {
  currentExpiry,
  daysRemaining,
  deriveStatus,
  formatDateHe,
  type SubscriptionRow,
  type SubscriptionStatus,
} from "@/lib/subscription";

type AdminSubscriptionView = {
  eventId: string;
  subscription: SubscriptionRow | null;
  status: SubscriptionStatus;
  expiresAt: string | null;
  daysRemaining: number;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "הפעולה נכשלה";
}

export default function Admin() {
  const [params] = useSearchParams();
  const view = params.get("view") ?? "";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [busy, setBusy] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [viewEventId, setViewEventId] = useState<string | null>(null);
  const [viewUser, setViewUser] = useState<AdminUser | null>(null);
  const [subscriptionsByUser, setSubscriptionsByUser] = useState<
    Record<string, AdminSubscriptionView>
  >({});

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (!view) {
      setViewEventId(null);
      setViewUser(null);
      return;
    }
    (async () => {
      const u = users.find((x) => x.id === view);
      if (u) setViewUser(u);
      try {
        const ev = await adminGetUserEventId({ userId: view });
        if (ev) setViewEventId(ev.id);
      } catch (e: unknown) {
        toast.error(errorMessage(e));
      }
    })();
  }, [view, users]);

  async function refresh() {
    setBusy(true);
    try {
      const nextUsers = await adminListUsers();
      setUsers(nextUsers);
      await refreshSubscriptions(nextUsers);
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    }
    setBusy(false);
  }

  async function refreshSubscriptions(nextUsers: AdminUser[]) {
    if (nextUsers.length === 0) {
      setSubscriptionsByUser({});
      return;
    }
    const { data, error } = await supabase
      .from("events")
      .select(
        "id,owner_id,subscriptions(id,event_id,plan,trial_started_at,trial_expires_at,premium_started_at,premium_expires_at)",
      );
    if (error) {
      toast.error("טעינת נתוני המנויים נכשלה");
      return;
    }
    const map: Record<string, AdminSubscriptionView> = {};
    (data ?? []).forEach((row) => {
      const eventRow = row as unknown as {
        id: string;
        owner_id: string;
        subscriptions: SubscriptionRow | SubscriptionRow[] | null;
      };
      const subscription = Array.isArray(eventRow.subscriptions)
        ? (eventRow.subscriptions[0] ?? null)
        : eventRow.subscriptions;
      const status = deriveStatus(subscription);
      const expiresAt = currentExpiry(subscription);
      map[eventRow.owner_id] = {
        eventId: eventRow.id,
        subscription,
        status,
        expiresAt,
        daysRemaining: daysRemaining(expiresAt),
      };
    });
    setSubscriptionsByUser(map);
  }

  async function toggleActive(u: AdminUser) {
    try {
      await adminToggleActive({ userId: u.id, isActive: !u.is_active });
      toast.success(u.is_active ? "החשבון הושבת" : "החשבון הופעל");
      refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    }
  }

  async function deleteUser(u: AdminUser) {
    if (!confirm(`למחוק לצמיתות את ${u.email}? כל הנתונים יימחקו.`)) return;
    try {
      await adminDeleteUser({ userId: u.id });
      toast.success("המשתמש נמחק");
      refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    }
  }

  async function resetPass(u: AdminUser) {
    try {
      await adminResetPassword({ email: u.email });
      toast.success("לינק איפוס נשלח");
    } catch (e: unknown) {
      toast.error(errorMessage(e));
    }
  }

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
              <Link
                to="/admin"
                className="inline-flex items-center gap-1 rounded-full bg-card px-3 py-1 font-medium hover:bg-secondary"
              >
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
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <h1 className="font-display text-2xl text-foreground sm:text-3xl">ניהול משתמשים</h1>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <Stat label="סה״כ משתמשים" value={users.length} />
          <Stat label="פעילים" value={active} tone="success" />
          <Stat label="מושהים" value={suspended} tone="danger" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep"
          >
            <UserPlus size={15} /> הוסף משתמש
          </button>
          <button
            onClick={() => setShowInvite(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            <Mail size={15} /> שלח הזמנה
          </button>
        </div>

        {busy ? (
          <div className="mt-4 rounded-2xl bg-card p-8 text-center text-muted-foreground ring-1 ring-border">
            <Loader2 className="mx-auto size-6 animate-spin" />
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="mt-4 hidden overflow-hidden rounded-2xl bg-card ring-1 ring-border md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-right text-sm">
                  <thead className="bg-secondary/50 text-xs font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3">שם</th>
                      <th className="px-3 py-3">מייל</th>
                      <th className="px-3 py-3">תפקיד</th>
                      <th className="px-3 py-3">מנוי</th>
                      <th className="px-3 py-3">סטטוס</th>
                      <th className="px-3 py-3">נוצר</th>
                      <th className="px-3 py-3 text-center">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-border">
                        <td className="px-3 py-3 font-medium">{u.full_name ?? "—"}</td>
                        <td className="px-3 py-3 text-muted-foreground" dir="ltr">
                          {u.email}
                        </td>
                        <td className="px-3 py-3">
                          {u.isAdmin ? (
                            <span className="rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold">
                              אדמין
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">משתמש</span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <SubscriptionCell value={subscriptionsByUser[u.id]} />
                        </td>
                        <td className="px-3 py-3">
                          {u.isAdmin ? (
                            <span className="text-xs text-muted-foreground">—</span>
                          ) : (
                            <ToggleSwitch
                              checked={u.is_active}
                              onChange={() => toggleActive(u)}
                              labelOn="פעיל"
                              labelOff="לא פעיל"
                            />
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("he-IL")}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-center gap-1">
                            <Link
                              to={`/admin?view=${u.id}`}
                              title="צפה"
                              aria-label="צפה"
                              className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                            >
                              <Eye size={14} />
                            </Link>
                            <button
                              title="ערוך"
                              aria-label="ערוך"
                              onClick={() => setEditUser(u)}
                              className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              title="שלח מייל איפוס"
                              aria-label="שלח מייל איפוס"
                              onClick={() => resetPass(u)}
                              className="rounded-md p-2 text-muted-foreground hover:bg-secondary"
                            >
                              <KeyRound size={14} />
                            </button>
                            {!u.isAdmin && (
                              <button
                                title="מחק"
                                aria-label="מחק"
                                onClick={() => deleteUser(u)}
                                className="rounded-md p-2 text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                          אין משתמשים עדיין
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="mt-4 space-y-3 md:hidden">
              {users.length === 0 && (
                <div className="rounded-2xl bg-card p-6 text-center text-sm text-muted-foreground ring-1 ring-border">
                  אין משתמשים עדיין
                </div>
              )}
              {users.map((u) => (
                <div key={u.id} className="rounded-2xl bg-card p-4 ring-1 ring-border">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-foreground">
                        {u.full_name ?? "—"}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground" dir="ltr">
                        {u.email}
                      </div>
                    </div>
                    {u.isAdmin ? (
                      <span className="shrink-0 rounded-full bg-gold/20 px-2 py-0.5 text-[10px] font-semibold">
                        אדמין
                      </span>
                    ) : (
                      <span className="shrink-0 text-[10px] text-muted-foreground">משתמש</span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("he-IL")}
                    </div>
                    {!u.isAdmin && (
                      <ToggleSwitch
                        checked={u.is_active}
                        onChange={() => toggleActive(u)}
                        labelOn="פעיל"
                        labelOff="לא פעיל"
                      />
                    )}
                  </div>
                  <div className="mt-3 border-t border-border pt-3">
                    <SubscriptionCell value={subscriptionsByUser[u.id]} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                    <Link
                      to={`/admin?view=${u.id}`}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <Eye size={13} /> צפה
                    </Link>
                    <button
                      onClick={() => setEditUser(u)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <Pencil size={13} /> ערוך
                    </button>
                    <button
                      onClick={() => resetPass(u)}
                      className="inline-flex min-h-9 items-center gap-1 rounded-md bg-secondary px-2.5 py-1.5 text-xs text-foreground"
                    >
                      <KeyRound size={13} /> איפוס
                    </button>
                    {!u.isAdmin && (
                      <button
                        onClick={() => deleteUser(u)}
                        className="inline-flex min-h-9 items-center gap-1 rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
                      >
                        <Trash2 size={13} /> מחק
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            setShowAdd(false);
            refresh();
          }}
        />
      )}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSent={() => {
            setShowInvite(false);
            toast.success("ההזמנה נשלחה");
            refresh();
          }}
        />
      )}
      {editUser && (
        <EditUserModal
          user={editUser}
          onClose={() => setEditUser(null)}
          onSaved={() => {
            setEditUser(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function ToggleSwitch({
  checked,
  onChange,
  labelOn,
  labelOff,
}: {
  checked: boolean;
  onChange: () => void;
  labelOn: string;
  labelOff: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className="inline-flex items-center gap-2"
    >
      <span
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${checked ? "bg-success" : "bg-muted"}`}
      >
        <span
          className={`inline-block size-5 transform rounded-full bg-card shadow transition-transform ${checked ? "translate-x-0.5" : "-translate-x-[22px]"}`}
        />
      </span>
      <span className={`text-xs font-medium ${checked ? "text-success" : "text-muted-foreground"}`}>
        {checked ? labelOn : labelOff}
      </span>
    </button>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(user.full_name ?? "");
  const [email, setEmail] = useState(user.email);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: { userId: string; fullName?: string; email?: string; password?: string } = {
        userId: user.id,
      };
      if (fullName && fullName !== user.full_name) payload.fullName = fullName;
      if (email && email !== user.email) payload.email = email;
      if (password) payload.password = password;
      await adminUpdateUser(payload);
      toast.success("המשתמש עודכן");
      onSaved();
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} title={`עריכת משתמש`}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">שם מלא</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">מייל</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            dir="ltr"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            סיסמא חדשה (השאר ריק לא לשנות)
          </label>
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            dir="ltr"
            placeholder="לפחות 6 תווים"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex justify-start gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50"
          >
            {busy ? "שומר…" : "שמור"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success"
      : tone === "danger"
        ? "text-destructive"
        : "text-foreground";
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-border">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-3xl ${color}`}>{value}</div>
    </div>
  );
}

function SubscriptionCell({ value }: { value?: AdminSubscriptionView }) {
  if (!value) return <span className="text-xs text-muted-foreground">אין נתון</span>;
  const label =
    value.status === "premium_active"
      ? "Premium פעיל"
      : value.status === "premium_expired"
        ? "Premium פג"
        : value.status === "trial_active"
          ? "ניסיון פעיל"
          : "ניסיון פג";
  const tone =
    value.status === "premium_active"
      ? "bg-gold/15 text-foreground ring-gold/40"
      : value.status === "trial_active"
        ? "bg-secondary text-foreground ring-border"
        : "bg-destructive/10 text-destructive ring-destructive/30";

  return (
    <div className="min-w-32 text-xs">
      <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ring-1 ${tone}`}>
        {label}
      </span>
      <div className="mt-1 text-muted-foreground">
        תוקף: {formatDateHe(value.expiresAt)}
        {value.daysRemaining > 0 ? ` · ${value.daysRemaining} ימים` : ""}
      </div>
      {value.subscription?.premium_started_at && (
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          התחלת Premium: {formatDateHe(value.subscription.premium_started_at)}
        </div>
      )}
      <div className="mt-0.5 text-[11px] text-muted-foreground">
        התחלת ניסיון: {formatDateHe(value.subscription?.trial_started_at ?? null)}
      </div>
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminCreateUser({ fullName, email, password });
      toast.success("המשתמש נוצר");
      onCreated();
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} title="הוסף משתמש חדש">
      <form onSubmit={submit} className="space-y-3">
        <input
          required
          placeholder="שם מלא"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="מייל"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <input
          required
          type="text"
          placeholder="סיסמא (לפחות 6)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          dir="ltr"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-start gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50"
          >
            {busy ? "יוצר…" : "צור חשבון"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}

function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await adminInviteUser({ email });
      onSent();
    } catch (err: unknown) {
      toast.error(errorMessage(err));
    }
    setBusy(false);
  }
  return (
    <Modal onClose={onClose} title="הזמן משתמש במייל">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-muted-foreground">המוזמן יקבל מייל עם לינק להשלמת הרשמה.</p>
        <input
          required
          type="email"
          placeholder="מייל"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          dir="ltr"
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        />
        <div className="flex justify-start gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-rose px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary-deep disabled:opacity-50"
          >
            {busy ? "שולח…" : "שלח הזמנה"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm hover:bg-secondary"
          >
            ביטול
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Modal({
  children,
  title,
  onClose,
}: {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 font-display text-xl">{title}</h3>
        {children}
      </div>
    </div>
  );
}
