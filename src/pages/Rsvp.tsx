import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Link as LinkIcon,
  Loader2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppTopBar } from "@/components/AppTopBar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { UpgradeDialog } from "@/components/subscription/UpgradeDialog";
import { useRsvp } from "@/hooks/useRsvp";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  RSVP_STATUS_LABELS,
  RSVP_STATUS_VARIANTS,
  RSVP_STATUSES,
  buildWhatsappMessage,
  formatRsvpDate,
  normalizePhoneForWhatsapp,
  validateConfirmedCount,
  type RsvpRow,
  type RsvpStats,
  type RsvpStatus,
} from "@/lib/rsvp";
import type { UpgradeReason } from "@/lib/subscription";

type EditDraft = {
  status: RsvpStatus;
  confirmedCount: number | null;
  note: string;
  dietaryNotes: string;
};

export default function Rsvp() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const rsvp = useRsvp(eventId);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<RsvpStatus | "all">("all");
  const [editing, setEditing] = useState<RsvpRow | null>(null);
  const [linkGuest, setLinkGuest] = useState<RsvpRow | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const canView = !!workspace.activeWorkspace && workspace.can("rsvp_view");
  const canEdit = canView && workspace.can("rsvp_edit") && subscription.canEdit;
  const readOnly = !canEdit;
  const expiredReason: UpgradeReason =
    subscription.status === "premium_expired" ? "premium_expired" : "trial_expired";

  useEffect(() => {
    setEditing(null);
    setLinkGuest(null);
    setSearch("");
    setFilter("all");
  }, [eventId]);

  const rows = useMemo(() => {
    const term = search.trim();
    return rsvp.rows
      .filter((row) => (filter === "all" ? true : row.status === filter))
      .filter((row) =>
        term
          ? [row.guest_name, row.guest_phone, row.guest_email]
              .filter(Boolean)
              .some((value) => String(value).includes(term))
          : true,
      );
  }, [filter, rsvp.rows, search]);

  const blockEdit = () => {
    if (subscription.isExpired) {
      setUpgradeReason(expiredReason);
      return;
    }
    toast.error("אין לך הרשאה לעריכת אישורי הגעה");
  };

  const state = (() => {
    if (workspace.loading) return <State title="טוען סביבת עבודה" loading />;
    if (workspace.error)
      return <State title="שגיאה בטעינת סביבת העבודה" action={() => void workspace.refresh()} />;
    if (!workspace.activeWorkspace) return <State title="אין סביבת עבודה להצגה" />;
    if (!canView) return <State title="אין לך הרשאה לצפייה באישורי הגעה באירוע הזה" />;
    if (rsvp.loading || subscription.loading) return <State title="טוען אישורי הגעה" loading />;
    if (rsvp.error)
      return <State title="לא הצלחנו לטעון את אישורי ההגעה" action={() => void rsvp.refresh()} />;
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
                <h1 className="font-display text-2xl text-foreground sm:text-3xl">אישורי הגעה</h1>
                <p className="text-sm text-muted-foreground">
                  {workspace.activeWorkspace?.event_name} · ניהול RSVP לפי קבוצות הזמנה
                </p>
              </div>
              <Button variant="outline" onClick={() => void rsvp.refresh()}>
                <RefreshCw size={15} className={rsvp.refreshing ? "animate-spin" : ""} />
                רענון
              </Button>
            </header>

            {subscription.isExpired && (
              <Banner
                title="הגישה לעריכה הסתיימה"
                text="המידע נשמר, ניתן לצפות באישורי ההגעה אך לא לבצע שינויים."
              />
            )}
            {!workspace.can("rsvp_edit") && (
              <Banner title="צפייה בלבד" text="לתפקיד הנוכחי אין הרשאת עריכת RSVP." />
            )}

            <Stats stats={rsvp.stats} />

            <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 font-semibold text-foreground">
                  <Settings size={18} />
                  הגדרות RSVP
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={rsvp.settings.rsvp_collect_dietary}
                    onClick={(event) => {
                      if (readOnly) {
                        event.preventDefault();
                        blockEdit();
                      }
                    }}
                    onChange={(event) =>
                      readOnly ? blockEdit() : void rsvp.updateSettings(event.target.checked)
                    }
                    className="size-4"
                  />
                  אפשר לאורחים לציין הערות תזונתיות
                </label>
              </div>
            </section>

            <section className="rounded-2xl bg-card p-4 ring-1 ring-border">
              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                  <Search className="absolute right-3 top-3 size-4 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="חיפוש לפי שם, טלפון או אימייל"
                    className="min-h-11 w-full rounded-xl border border-input bg-background pr-9 text-sm"
                  />
                </div>
                <select
                  value={filter}
                  onChange={(event) => setFilter(event.target.value as RsvpStatus | "all")}
                  className="min-h-11 rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="all">כל הסטטוסים</option>
                  {RSVP_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {RSVP_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
              </div>

              {rows.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                  אין קבוצות להזמנה שתואמות לחיפוש.
                </div>
              ) : (
                <>
                  <div className="mt-4 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[880px] text-right text-sm">
                      <thead className="border-b border-border text-xs text-muted-foreground">
                        <tr>
                          <th className="py-2">קבוצה</th>
                          <th>הוזמנו</th>
                          <th>אישרו</th>
                          <th>סטטוס</th>
                          <th>תגובה</th>
                          <th>יצירת קשר</th>
                          <th>קישור</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <RsvpTableRow
                            key={row.guest_id}
                            row={row}
                            readOnly={readOnly}
                            onBlocked={blockEdit}
                            onEdit={() => setEditing(row)}
                            onLink={() => setLinkGuest(row)}
                            onContact={() => void rsvp.markContact(row.guest_id)}
                            onReminder={() => void rsvp.markReminder(row.guest_id)}
                            contactBusy={rsvp.isContactPending(row.guest_id, "contact")}
                            reminderBusy={rsvp.isContactPending(row.guest_id, "reminder")}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-4 grid gap-3 md:hidden">
                    {rows.map((row) => (
                      <RsvpCard
                        key={row.guest_id}
                        row={row}
                        readOnly={readOnly}
                        onBlocked={blockEdit}
                        onEdit={() => setEditing(row)}
                        onLink={() => setLinkGuest(row)}
                        onContact={() => void rsvp.markContact(row.guest_id)}
                        onReminder={() => void rsvp.markReminder(row.guest_id)}
                        contactBusy={rsvp.isContactPending(row.guest_id, "contact")}
                        reminderBusy={rsvp.isContactPending(row.guest_id, "reminder")}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </main>

      <RsvpEditDialog
        row={editing}
        collectDietary={rsvp.settings.rsvp_collect_dietary}
        readOnly={readOnly}
        onClose={() => setEditing(null)}
        onBlocked={blockEdit}
        onSubmit={async (row, draft) => {
          const ok = await rsvp.setState({
            guestId: row.guest_id,
            status: draft.status,
            confirmedCount: draft.confirmedCount,
            note: draft.note,
            dietaryNotes: rsvp.settings.rsvp_collect_dietary ? draft.dietaryNotes : null,
          });
          if (ok) setEditing(null);
        }}
      />
      <RsvpLinkDialog
        row={linkGuest}
        eventName={workspace.activeWorkspace?.event_name ?? null}
        readOnly={readOnly}
        onClose={() => setLinkGuest(null)}
        onBlocked={blockEdit}
        onIssue={async (guestId) => await rsvp.issueLink(guestId)}
        onRevoke={async (guestId) => await rsvp.revokeLink(guestId)}
      />
      <UpgradeDialog
        open={!!upgradeReason}
        reason={upgradeReason ?? "generic"}
        onClose={() => setUpgradeReason(null)}
      />
    </div>
  );
}

function Stats({ stats }: { stats: RsvpStats }) {
  const items = [
    ["הוזמנו", stats.invited, "אנשים"],
    ["אישרו", stats.confirmed, "אנשים"],
    ["לא מגיעים", stats.declined, "אנשים"],
    ["ממתינים", stats.awaiting, "אנשים"],
    ["אישרו חלקית", stats.partialGroups, "קבוצות"],
    ["אחוז מענה", `${stats.responseRate}%`, `${stats.respondedGroups}/${stats.groups} קבוצות`],
  ];
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
      {items.map(([label, value, unit]) => (
        <div key={label} className="rounded-2xl bg-card p-4 ring-1 ring-border">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-1 font-display text-2xl text-foreground">{value}</div>
          <div className="text-[11px] text-muted-foreground">{unit}</div>
        </div>
      ))}
    </section>
  );
}

function RsvpTableRow(props: {
  row: RsvpRow;
  readOnly: boolean;
  onEdit: () => void;
  onLink: () => void;
  onContact: () => void;
  onReminder: () => void;
  onBlocked: () => void;
  contactBusy: boolean;
  reminderBusy: boolean;
}) {
  const { row } = props;
  return (
    <tr className="border-b border-border last:border-0">
      <td className="py-3">
        <div className="font-medium">{row.guest_name}</div>
        <div className="text-xs text-muted-foreground" dir="ltr">
          {[row.guest_phone, row.guest_email].filter(Boolean).join(" · ")}
        </div>
      </td>
      <td>{row.group_size}</td>
      <td>{row.confirmed_count ?? "—"}</td>
      <td>
        <StatusBadge status={row.status} />
      </td>
      <td>{formatRsvpDate(row.responded_at)}</td>
      <td>
        <div className="text-xs">אחרון: {formatRsvpDate(row.last_contact_at)}</div>
        <div className="text-xs text-muted-foreground">
          תזכורת: {formatRsvpDate(row.last_reminder_at)}
        </div>
      </td>
      <td>{row.link_active ? "פעיל" : row.link_revoked_at ? "בוטל" : "אין פעיל"}</td>
      <td>
        <div className="flex flex-wrap gap-1">
          <IconButton label="עריכה" onClick={props.onEdit} icon={<Pencil size={14} />} />
          <IconButton label="קישור" onClick={props.onLink} icon={<LinkIcon size={14} />} />
          <IconButton
            label="סימון שנשלח"
            onClick={props.readOnly ? props.onBlocked : props.onContact}
            disabled={props.contactBusy}
            icon={
              props.contactBusy ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <Send size={14} />
              )
            }
          />
          <IconButton
            label="תזכורת"
            onClick={props.readOnly ? props.onBlocked : props.onReminder}
            disabled={props.reminderBusy}
            icon={
              props.reminderBusy ? (
                <Loader2 className="animate-spin" size={14} />
              ) : (
                <MessageCircle size={14} />
              )
            }
          />
        </div>
      </td>
    </tr>
  );
}

function RsvpCard(props: {
  row: RsvpRow;
  readOnly: boolean;
  onEdit: () => void;
  onLink: () => void;
  onContact: () => void;
  onReminder: () => void;
  onBlocked: () => void;
  contactBusy: boolean;
  reminderBusy: boolean;
}) {
  const { row } = props;
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold">{row.guest_name}</div>
          <div className="text-xs text-muted-foreground">
            הוזמנו {row.group_size} · אישרו {row.confirmed_count ?? "—"}
          </div>
        </div>
        <StatusBadge status={row.status} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        <span>תגובה: {formatRsvpDate(row.responded_at)}</span>
        <span>קשר: {formatRsvpDate(row.last_contact_at)}</span>
        <span className="col-span-2">תזכורת: {formatRsvpDate(row.last_reminder_at)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={props.onEdit}>
          <Pencil size={14} /> עריכה
        </Button>
        <Button variant="outline" size="sm" onClick={props.onLink}>
          <LinkIcon size={14} /> קישור
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.readOnly ? props.onBlocked : props.onContact}
          disabled={props.contactBusy}
        >
          {props.contactBusy ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          סומן שנשלח
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={props.readOnly ? props.onBlocked : props.onReminder}
          disabled={props.reminderBusy}
        >
          {props.reminderBusy ? (
            <Loader2 className="animate-spin" size={14} />
          ) : (
            <MessageCircle size={14} />
          )}
          תזכורת
        </Button>
      </div>
    </div>
  );
}

function RsvpEditDialog({
  row,
  collectDietary,
  readOnly,
  onClose,
  onBlocked,
  onSubmit,
}: {
  row: RsvpRow | null;
  collectDietary: boolean;
  readOnly: boolean;
  onClose: () => void;
  onBlocked: () => void;
  onSubmit: (row: RsvpRow, draft: EditDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!row) {
      setDraft(null);
      setSaving(false);
      return;
    }
    setDraft({
      status: row.status,
      confirmedCount: row.confirmed_count,
      note: row.note ?? "",
      dietaryNotes: row.dietary_notes ?? "",
    });
  }, [row]);

  if (!row || !draft) return null;
  const validation = validateConfirmedCount(draft.status, row.group_size, draft.confirmedCount);
  const submit = async () => {
    if (readOnly) {
      onBlocked();
      return;
    }
    if (validation || saving) return;
    setSaving(true);
    try {
      await onSubmit(row, {
        ...draft,
        confirmedCount:
          draft.status === "confirmed"
            ? row.group_size
            : draft.status === "declined"
              ? 0
              : draft.status === "partially_confirmed"
                ? draft.confirmedCount
                : null,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>עריכת RSVP · {row.guest_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="סטטוס">
            <select
              value={draft.status}
              onChange={(event) =>
                setDraft((prev) =>
                  prev ? { ...prev, status: event.target.value as RsvpStatus } : prev,
                )
              }
              disabled={readOnly}
              className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
            >
              {RSVP_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {RSVP_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </Field>
          {draft.status === "partially_confirmed" && (
            <Field label={`מספר מאשרים מתוך ${row.group_size}`}>
              <input
                type="number"
                min={1}
                max={Math.max(row.group_size - 1, 1)}
                value={draft.confirmedCount ?? ""}
                onChange={(event) =>
                  setDraft((prev) =>
                    prev ? { ...prev, confirmedCount: Number(event.target.value) || null } : prev,
                  )
                }
                disabled={readOnly}
                className="min-h-11 w-full rounded-xl border border-input bg-background px-3"
              />
            </Field>
          )}
          {validation && <p className="text-sm text-destructive">{validation}</p>}
          <Field label="הערה">
            <textarea
              value={draft.note}
              onChange={(event) =>
                setDraft((prev) => (prev ? { ...prev, note: event.target.value } : prev))
              }
              disabled={readOnly}
              maxLength={1000}
              className="min-h-24 w-full rounded-xl border border-input bg-background p-3"
            />
          </Field>
          {collectDietary && (
            <Field label="הערות תזונתיות">
              <textarea
                value={draft.dietaryNotes}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, dietaryNotes: event.target.value } : prev))
                }
                disabled={readOnly}
                maxLength={1000}
                className="min-h-24 w-full rounded-xl border border-input bg-background p-3"
              />
            </Field>
          )}
          <div className="rounded-xl bg-secondary/60 p-3 text-xs text-muted-foreground">
            תגובה: {formatRsvpDate(row.responded_at)} · נשלח: {formatRsvpDate(row.sent_at)} · קשר:{" "}
            {formatRsvpDate(row.last_contact_at)}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void submit()} disabled={saving || !!validation}>
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              שמירה
            </Button>
            <Button variant="outline" onClick={onClose}>
              סגירה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RsvpLinkDialog({
  row,
  eventName,
  readOnly,
  onClose,
  onBlocked,
  onIssue,
  onRevoke,
}: {
  row: RsvpRow | null;
  eventName: string | null;
  readOnly: boolean;
  onClose: () => void;
  onBlocked: () => void;
  onIssue: (guestId: string) => Promise<{ token: string; expires_at: string } | null>;
  onRevoke: (guestId: string) => Promise<boolean>;
}) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLink(null);
    setBusy(false);
  }, [row?.guest_id]);

  if (!row) return null;
  const message = link ? buildWhatsappMessage({ guestName: row.guest_name, eventName, link }) : "";
  const phone = normalizePhoneForWhatsapp(row.guest_phone);
  const whatsappUrl = `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`;

  const issue = async () => {
    if (readOnly) {
      onBlocked();
      return;
    }
    if (row.link_active && !confirm("יצירת קישור חדש תבטל את הקישור הפעיל הקיים. להמשיך?")) return;
    setBusy(true);
    try {
      const result = await onIssue(row.guest_id);
      if (!result) return;
      setLink(`${window.location.origin}/rsvp/${result.token}`);
      toast.success("קישור אישי נוצר");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>קישור אישי · {row.guest_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-xl bg-secondary/60 p-3 text-sm text-muted-foreground">
            {row.link_active
              ? `קיים קישור פעיל עד ${formatRsvpDate(row.link_expires_at)}. לא ניתן לשחזר קישור קיים.`
              : "אין קישור פעיל כרגע."}
          </div>
          {link && (
            <div className="rounded-xl border border-gold/40 bg-gold/10 p-3">
              <p className="text-xs font-semibold text-foreground">
                הקישור מוצג כעת בלבד. לאחר סגירת החלון יהיה צורך ליצור קישור חדש.
              </p>
              <input
                readOnly
                dir="ltr"
                value={link}
                className="mt-2 min-h-10 w-full rounded-lg border border-input bg-background px-3 text-xs"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(link, "הקישור הועתק")}
                >
                  <Copy size={14} /> העתק קישור
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(message, "ההודעה הועתקה")}
                >
                  <MessageCircle size={14} /> העתק הודעה
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(whatsappUrl, "_blank", "noopener,noreferrer")}
                >
                  <ExternalLink size={14} /> פתיחת WhatsApp
                </Button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void issue()} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <LinkIcon />}
              {row.link_active ? "קישור חדש" : "יצירת קישור אישי"}
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (readOnly) return onBlocked();
                if (!confirm("לבטל את הקישור הפעיל?")) return;
                setBusy(true);
                try {
                  const ok = await onRevoke(row.guest_id);
                  if (ok) setLink(null);
                } finally {
                  setBusy(false);
                }
              }}
              disabled={busy || !row.link_active}
            >
              <Trash2 size={14} /> ביטול קישור
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Copy/Open WhatsApp אינם מסמנים שליחה. השתמשו בפעולה “סימון שנשלח” במסך הראשי.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ status }: { status: RsvpStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${RSVP_STATUS_VARIANTS[status]}`}
    >
      {RSVP_STATUS_LABELS[status]}
    </span>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-background hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
    </button>
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
          נסה שוב
        </Button>
      )}
    </div>
  );
}

async function copyText(text: string, success: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(success);
  } catch {
    toast.error("ההעתקה נכשלה");
  }
}
