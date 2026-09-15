import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ExternalLink, Loader2, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppTopBar } from "@/components/AppTopBar";
import { UpgradeDialog } from "@/components/subscription/UpgradeDialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSubscription } from "@/hooks/useSubscription";
import { useVendors } from "@/hooks/useVendors";
import { useWorkspace } from "@/hooks/useWorkspace";
import { supabase } from "@/integrations/supabase/client";
import { formatILS } from "@/lib/wedding-data";
import {
  EMPTY_VENDOR_FORM,
  VENDOR_STATUSES,
  VENDOR_STATUS_LABELS,
  VENDOR_STATUS_STYLES,
  normalizeVendorForm,
  safeExternalUrl,
  safeInstagramUrl,
  vendorSearchText,
  vendorToForm,
  type VendorFormValues,
  type VendorRow,
  type VendorStatus,
} from "@/lib/vendors";
import type { UpgradeReason } from "@/lib/subscription";

type LinkedExpense = {
  id: string;
  name: string;
  category: string;
};

export default function Vendors() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("vendors_view");
  const canEdit = canView && workspace.can("vendors_edit") && subscription.canEdit;
  const vendors = useVendors(eventId, { canView, canEdit });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<VendorStatus | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [viewing, setViewing] = useState<VendorRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<VendorRow | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const expiredReason: UpgradeReason =
    subscription.status === "premium_expired" ? "premium_expired" : "trial_expired";

  useEffect(() => {
    setSearch("");
    setStatusFilter("all");
    setCategoryFilter("all");
    setEditing(null);
    setViewing(null);
    setShowCreate(false);
    setDeleteTarget(null);
    setUpgradeReason(null);
  }, [eventId]);

  const categories = useMemo(
    () =>
      Array.from(new Set(vendors.vendors.map((vendor) => vendor.category))).sort((a, b) =>
        a.localeCompare(b, "he"),
      ),
    [vendors.vendors],
  );

  const filteredVendors = useMemo(() => {
    const term = search.trim();
    return vendors.vendors
      .filter((vendor) => (statusFilter === "all" ? true : vendor.status === statusFilter))
      .filter((vendor) => (categoryFilter === "all" ? true : vendor.category === categoryFilter))
      .filter((vendor) => (term ? vendorSearchText(vendor).includes(term) : true));
  }, [categoryFilter, search, statusFilter, vendors.vendors]);

  const blockEdit = () => {
    if (subscription.isExpired) {
      setUpgradeReason(expiredReason);
      return;
    }
    toast.error("אין לך הרשאה לניהול ספקים");
  };

  const state = (() => {
    if (workspace.loading) return <State title="טוען סביבת עבודה" loading />;
    if (workspace.error)
      return <State title="שגיאה בטעינת סביבת העבודה" action={() => void workspace.refresh()} />;
    if (!workspace.activeWorkspace) return <State title="אין סביבת עבודה להצגה" />;
    if (!canView) return <State title="אין לך הרשאה לצפייה בספקים באירוע הזה" />;
    if (vendors.loading || subscription.loading) return <State title="טוען ספקים" loading />;
    if (vendors.error)
      return <State title="לא הצלחנו לטעון את הספקים" action={() => void vendors.refresh()} />;
    return null;
  })();

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppTopBar subscription={subscription} />
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 md:px-6">
        {state ?? (
          <div className="space-y-5">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl text-foreground sm:text-3xl">ספקים</h1>
                <p className="text-sm text-muted-foreground">
                  {workspace.activeWorkspace?.event_name} · ספקים נפרדים מההוצאות והתשלומים
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void vendors.refresh()}>
                  <RefreshCw size={15} className={vendors.refreshing ? "animate-spin" : ""} />
                  רענון
                </Button>
                <Button onClick={() => (canEdit ? setShowCreate(true) : blockEdit())}>
                  <Plus size={15} /> ספק חדש
                </Button>
              </div>
            </header>

            {subscription.isExpired && (
              <Banner title="צפייה בלבד" text="המידע נשמר, ניתן לצפות בספקים אך לא לבצע שינויים." />
            )}
            {!workspace.can("vendors_edit") && (
              <Banner title="צפייה בלבד" text="לתפקיד הנוכחי אין הרשאת עריכת ספקים." />
            )}

            <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="grid gap-3 md:grid-cols-[1fr_180px_180px]">
                <div className="relative">
                  <Search className="absolute right-3 top-3.5 size-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="חיפוש לפי עסק, איש קשר או קטגוריה"
                    className="min-h-11 w-full rounded-xl border border-input bg-background pr-9 text-sm"
                  />
                </div>
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value as VendorStatus | "all")}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="all">כל הסטטוסים</option>
                  {VENDOR_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {VENDOR_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="all">כל הקטגוריות</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {filteredVendors.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  {vendors.vendors.length === 0
                    ? "אין ספקים עדיין. אפשר להתחיל מספק ראשון."
                    : "אין ספקים שתואמים לחיפוש או לסינון."}
                </div>
              ) : (
                <>
                  <div className="mt-4 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[900px] text-right text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2">עסק</th>
                          <th>קטגוריה</th>
                          <th>איש קשר</th>
                          <th>הצעת מחיר ראשונית</th>
                          <th>סטטוס</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredVendors.map((vendor) => (
                          <VendorTableRow
                            key={vendor.id}
                            vendor={vendor}
                            readOnly={!canEdit}
                            onView={() => setViewing(vendor)}
                            onEdit={() => setEditing(vendor)}
                            onDelete={() => setDeleteTarget(vendor)}
                            onBlocked={blockEdit}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 md:hidden">
                    {filteredVendors.map((vendor) => (
                      <VendorCard
                        key={vendor.id}
                        vendor={vendor}
                        readOnly={!canEdit}
                        onView={() => setViewing(vendor)}
                        onEdit={() => setEditing(vendor)}
                        onDelete={() => setDeleteTarget(vendor)}
                        onBlocked={blockEdit}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <VendorFormDialog
        open={showCreate}
        title="ספק חדש"
        saving={vendors.isPending("add")}
        onClose={() => setShowCreate(false)}
        onSubmit={async (values) => {
          const { payload, error } = normalizeVendorForm(values);
          if (error) {
            toast.error(error);
            return false;
          }
          const ok = await vendors.addVendor(payload);
          if (ok) setShowCreate(false);
          return ok;
        }}
      />
      <VendorFormDialog
        open={!!editing}
        title={editing ? `עריכת ספק · ${editing.business_name}` : "עריכת ספק"}
        vendor={editing}
        saving={editing ? vendors.isPending(`update:${editing.id}`) : false}
        onClose={() => setEditing(null)}
        onSubmit={async (values) => {
          if (!editing) return false;
          const { payload, error } = normalizeVendorForm(values);
          if (error) {
            toast.error(error);
            return false;
          }
          const ok = await vendors.updateVendor(editing.id, payload);
          if (ok) setEditing(null);
          return ok;
        }}
      />
      <VendorDetailsDialog
        vendor={viewing}
        eventId={eventId}
        canViewExpenses={workspace.can("expenses_view")}
        onClose={() => setViewing(null)}
      />
      {deleteTarget && (
        <ConfirmDialog
          title={`למחוק את ${deleteTarget.business_name}?`}
          message="מחיקת הספק תנתק אותו מההוצאות המקושרות. ההוצאות והתשלומים יישמרו."
          confirmLabel="מחק ספק"
          busy={vendors.isPending(`delete:${deleteTarget.id}`)}
          onConfirm={async () => {
            const ok = await vendors.deleteVendor(deleteTarget.id);
            if (ok) setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      <UpgradeDialog
        open={!!upgradeReason}
        reason={upgradeReason ?? "generic"}
        onClose={() => setUpgradeReason(null)}
      />
    </div>
  );
}

function VendorTableRow({
  vendor,
  readOnly,
  onView,
  onEdit,
  onDelete,
  onBlocked,
}: {
  vendor: VendorRow;
  readOnly: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlocked: () => void;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3">
        <button type="button" onClick={onView} className="text-right font-semibold text-foreground">
          {vendor.business_name}
        </button>
        <ContactLinks vendor={vendor} />
      </td>
      <td>{vendor.category}</td>
      <td>{vendor.contact_name || "—"}</td>
      <td className="tabular-nums">
        {vendor.initial_quote == null ? "—" : formatILS(Number(vendor.initial_quote))}
      </td>
      <td>
        <StatusBadge status={vendor.status} />
      </td>
      <td>
        <div className="flex flex-wrap gap-1">
          <IconButton label="צפייה" onClick={onView} icon={<ExternalLink size={14} />} />
          <IconButton
            label="עריכה"
            onClick={readOnly ? onBlocked : onEdit}
            icon={<Pencil size={14} />}
          />
          <IconButton
            label="מחיקה"
            onClick={readOnly ? onBlocked : onDelete}
            icon={<Trash2 size={14} />}
          />
        </div>
      </td>
    </tr>
  );
}

function VendorCard(props: {
  vendor: VendorRow;
  readOnly: boolean;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onBlocked: () => void;
}) {
  const { vendor } = props;
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <button
            type="button"
            onClick={props.onView}
            className="truncate text-right font-semibold text-foreground"
          >
            {vendor.business_name}
          </button>
          <div className="mt-1 text-xs text-muted-foreground">
            {vendor.category} · {vendor.contact_name || "אין איש קשר"}
          </div>
        </div>
        <StatusBadge status={vendor.status} />
      </div>
      <div className="mt-3 text-sm">
        <span className="text-muted-foreground">הצעת מחיר ראשונית: </span>
        <span className="font-semibold tabular-nums">
          {vendor.initial_quote == null ? "—" : formatILS(Number(vendor.initial_quote))}
        </span>
      </div>
      <ContactLinks vendor={vendor} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={props.onView}>
          צפייה
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.readOnly ? props.onBlocked : props.onEdit}
        >
          <Pencil size={14} /> עריכה
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.readOnly ? props.onBlocked : props.onDelete}
        >
          <Trash2 size={14} /> מחיקה
        </Button>
      </div>
    </div>
  );
}

function VendorFormDialog({
  open,
  title,
  vendor,
  saving,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  vendor?: VendorRow | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (values: VendorFormValues) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<VendorFormValues>(EMPTY_VENDOR_FORM);

  useEffect(() => {
    if (!open) return;
    setDraft(vendorToForm(vendor ?? null));
  }, [open, vendor]);

  const update = (key: keyof VendorFormValues, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = async () => {
    if (saving) return;
    await onSubmit(draft);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !saving) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="שם העסק *">
            <input
              value={draft.business_name}
              onChange={(event) => update("business_name", event.target.value)}
              maxLength={160}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="קטגוריה *">
            <input
              value={draft.category}
              onChange={(event) => update("category", event.target.value)}
              maxLength={80}
              placeholder="צילום, מוזיקה, עיצוב..."
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="שם איש קשר">
            <input
              value={draft.contact_name}
              onChange={(event) => update("contact_name", event.target.value)}
              maxLength={160}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="טלפון">
            <input
              value={draft.phone}
              onChange={(event) => update("phone", event.target.value)}
              maxLength={40}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="WhatsApp">
            <input
              value={draft.whatsapp_phone}
              onChange={(event) => update("whatsapp_phone", event.target.value)}
              maxLength={40}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="אימייל">
            <input
              type="email"
              value={draft.email}
              onChange={(event) => update("email", event.target.value)}
              maxLength={254}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            />
          </Field>
          <Field label="אתר">
            <input
              value={draft.website}
              onChange={(event) => update("website", event.target.value)}
              maxLength={300}
              placeholder="https://example.com"
              dir="ltr"
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-left"
            />
          </Field>
          <Field label="Instagram">
            <input
              value={draft.instagram}
              onChange={(event) => update("instagram", event.target.value)}
              maxLength={300}
              placeholder="@business או קישור"
              dir="ltr"
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 text-left"
            />
          </Field>
          <Field label="הצעת מחיר ראשונית">
            <input
              type="number"
              min={0}
              value={draft.initial_quote}
              onChange={(event) => update("initial_quote", event.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3 tabular-nums"
            />
          </Field>
          <Field label="סטטוס">
            <select
              value={draft.status}
              onChange={(event) => update("status", event.target.value)}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              {VENDOR_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {VENDOR_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="הערות">
              <textarea
                value={draft.notes}
                onChange={(event) => update("notes", event.target.value)}
                maxLength={4000}
                className="min-h-28 w-full rounded-xl border border-input bg-background p-3"
              />
            </Field>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : <Plus />}
            שמירה
          </Button>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            ביטול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VendorDetailsDialog({
  vendor,
  eventId,
  canViewExpenses,
  onClose,
}: {
  vendor: VendorRow | null;
  eventId: string | null;
  canViewExpenses: boolean;
  onClose: () => void;
}) {
  const [expenses, setExpenses] = useState<LinkedExpense[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setExpenses([]);
    setError(false);
    if (!vendor || !eventId || !canViewExpenses) return;
    setLoading(true);
    (async () => {
      const { data, error: loadError } = await supabase
        .from("expenses")
        .select("id,name,category")
        .eq("event_id", eventId)
        .eq("vendor_id", vendor.id)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (loadError) {
        setError(true);
      } else {
        setExpenses((data ?? []) as LinkedExpense[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [canViewExpenses, eventId, vendor]);

  if (!vendor) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{vendor.business_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <Info label="קטגוריה" value={vendor.category} />
            <Info label="סטטוס" value={VENDOR_STATUS_LABELS[vendor.status]} />
            <Info label="איש קשר" value={vendor.contact_name} />
            <Info label="טלפון" value={vendor.phone} />
            <Info label="WhatsApp" value={vendor.whatsapp_phone} />
            <Info label="אימייל" value={vendor.email} />
            <Info
              label="הצעת מחיר ראשונית"
              value={vendor.initial_quote == null ? null : formatILS(Number(vendor.initial_quote))}
            />
          </div>
          <ContactLinks vendor={vendor} />
          {vendor.notes && (
            <div className="rounded-xl bg-secondary/50 p-3 text-sm text-muted-foreground">
              {vendor.notes}
            </div>
          )}
          <section className="rounded-xl border border-border p-3">
            <h3 className="font-semibold text-foreground">הוצאות מקושרות</h3>
            {!canViewExpenses ? (
              <p className="mt-2 text-sm text-muted-foreground">
                לתפקיד הנוכחי אין הרשאת צפייה בהוצאות, לכן לא נטען מידע כספי.
              </p>
            ) : loading ? (
              <p className="mt-2 text-sm text-muted-foreground">טוען הוצאות...</p>
            ) : error ? (
              <p className="mt-2 text-sm text-destructive">טעינת ההוצאות נכשלה.</p>
            ) : expenses.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">אין הוצאות מקושרות לספק.</p>
            ) : (
              <ul className="mt-2 space-y-1 text-sm">
                {expenses.map((expense) => (
                  <li key={expense.id} className="rounded-lg bg-secondary/50 px-3 py-2">
                    {expense.name} · {expense.category}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <Button variant="outline" onClick={onClose}>
            סגירה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactLinks({ vendor }: { vendor: VendorRow }) {
  const website = safeExternalUrl(vendor.website);
  const instagram = safeInstagramUrl(vendor.instagram);
  const email = vendor.email?.trim();
  const links = [
    website ? { label: "אתר", href: website } : null,
    instagram ? { label: "Instagram", href: instagram } : null,
    email ? { label: "אימייל", href: `mailto:${email}` } : null,
  ].filter(Boolean) as { label: string; href: string }[];
  if (links.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2 text-xs">
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target={link.href.startsWith("http") ? "_blank" : undefined}
          rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: VendorStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${VENDOR_STATUS_STYLES[status]}`}
    >
      {VENDOR_STATUS_LABELS[status]}
    </span>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-foreground">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground">{value || "—"}</div>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary"
    >
      {icon}
    </button>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-card p-6 shadow-xl ring-1 ring-border"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className="font-display text-xl text-foreground">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-5 flex justify-start gap-2">
          <Button variant="destructive" onClick={() => void onConfirm()} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />}
            {confirmLabel}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            ביטול
          </Button>
        </div>
      </div>
    </div>
  );
}

function Banner({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm">
      <span className="font-semibold">{title}</span> · {text}
    </div>
  );
}

function State({
  title,
  loading,
  action,
}: {
  title: string;
  loading?: boolean;
  action?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-card p-8 text-center ring-1 ring-border">
      {loading && <Loader2 className="mx-auto mb-3 size-7 animate-spin text-rose" />}
      <h1 className="font-display text-2xl text-foreground">{title}</h1>
      {action && (
        <Button className="mt-4" onClick={action}>
          <RefreshCw size={15} /> נסה שוב
        </Button>
      )}
    </div>
  );
}
