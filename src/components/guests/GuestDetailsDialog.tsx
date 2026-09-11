import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  GUEST_AGE_GROUPS,
  GUEST_MEAL_PREFERENCES,
  type GuestAgeGroup,
  type GuestMealPreference,
} from "@/lib/guest-domain";
import { SIDES, type Guest, type GuestSide } from "@/hooks/useGuests";
import type { GuestMember, GuestMemberUpdate, NewGuestMember } from "@/hooks/useGuestMembers";

type MemberDraft = {
  full_name: string;
  age_group: GuestAgeGroup | "";
  meal_preference: GuestMealPreference | "";
  dietary_notes: string;
  accessibility_notes: string;
};

type Props = {
  guest: Guest | null;
  members: GuestMember[];
  open: boolean;
  readOnly?: boolean;
  loadingMembers?: boolean;
  onClose: () => void;
  onUpdateGuest: (id: string, updates: Partial<Guest>) => boolean | Promise<boolean>;
  onAddMember: (guestId: string, values: NewGuestMember) => Promise<boolean>;
  onUpdateMember: (id: string, updates: GuestMemberUpdate) => Promise<boolean>;
  onDeleteMember: (id: string) => Promise<boolean>;
};

const field = "min-h-10 w-full rounded-lg border border-border bg-background px-3 text-sm";

function toDraft(member?: GuestMember): MemberDraft {
  return {
    full_name: member?.full_name ?? "",
    age_group: (member?.age_group as GuestAgeGroup | null) ?? "",
    meal_preference: (member?.meal_preference as GuestMealPreference | null) ?? "",
    dietary_notes: member?.dietary_notes ?? "",
    accessibility_notes: member?.accessibility_notes ?? "",
  };
}

function toMemberPayload(draft: MemberDraft): NewGuestMember {
  return {
    full_name: draft.full_name.trim() || null,
    age_group: draft.age_group || null,
    meal_preference: draft.meal_preference || null,
    dietary_notes: draft.dietary_notes.trim() || null,
    accessibility_notes: draft.accessibility_notes.trim() || null,
  };
}

export function GuestDetailsDialog({
  guest,
  members,
  open,
  readOnly,
  loadingMembers,
  onClose,
  onUpdateGuest,
  onAddMember,
  onUpdateMember,
  onDeleteMember,
}: Props) {
  const [fullName, setFullName] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [side, setSide] = useState<GuestSide>("משותף");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [groupCategory, setGroupCategory] = useState("");
  const [relationship, setRelationship] = useState("");
  const [needsTransport, setNeedsTransport] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [groupError, setGroupError] = useState("");
  const [savingGroup, setSavingGroup] = useState(false);
  const [newMember, setNewMember] = useState<MemberDraft>(toDraft());
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, MemberDraft>>({});

  useEffect(() => {
    if (!guest) return;
    setFullName(guest.full_name);
    setGroupSize(guest.group_size || 1);
    setSide(guest.side ?? "משותף");
    setPhone(guest.phone ?? "");
    setEmail(guest.email ?? "");
    setGroupCategory(guest.group_category ?? "");
    setRelationship(guest.relationship ?? "");
    setNeedsTransport(guest.needs_transport);
    setPickupLocation(guest.pickup_location ?? "");
    setNotes(guest.notes ?? "");
    setGroupError("");
    setNewMember(toDraft());
  }, [guest]);

  useEffect(() => {
    setDrafts(
      members.reduce<Record<string, MemberDraft>>((acc, member) => {
        acc[member.id] = toDraft(member);
        return acc;
      }, {}),
    );
  }, [members]);

  const memberLimitReached = !!guest && members.length >= guest.group_size;
  const canSaveGroup = Boolean(fullName.trim()) && groupSize >= members.length && !savingGroup;

  const sortedMembers = useMemo(
    () =>
      [...members].sort(
        (a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at),
      ),
    [members],
  );

  const saveGroup = async () => {
    if (!guest || readOnly || !canSaveGroup) return;
    if (groupSize < members.length) {
      setGroupError(`אי אפשר להקטין את הקבוצה לפחות מ-${members.length} משתתפים שכבר פורטו.`);
      return;
    }
    setSavingGroup(true);
    setGroupError("");
    try {
      await onUpdateGuest(guest.id, {
        full_name: fullName.trim(),
        group_size: Math.max(1, groupSize || 1),
        side,
        phone: phone.trim() || null,
        email: email.trim() || null,
        group_category: groupCategory.trim() || null,
        relationship: relationship.trim() || null,
        needs_transport: needsTransport,
        pickup_location: needsTransport ? pickupLocation.trim() || null : null,
        notes: notes.trim() || null,
      });
    } finally {
      setSavingGroup(false);
    }
  };

  const addMember = async () => {
    if (!guest || readOnly || memberLimitReached || savingMemberId) return;
    setSavingMemberId("new");
    try {
      const ok = await onAddMember(guest.id, toMemberPayload(newMember));
      if (ok) setNewMember(toDraft());
    } finally {
      setSavingMemberId(null);
    }
  };

  const updateMember = async (member: GuestMember) => {
    if (readOnly || savingMemberId) return;
    setSavingMemberId(member.id);
    try {
      await onUpdateMember(member.id, toMemberPayload(drafts[member.id] ?? toDraft(member)));
    } finally {
      setSavingMemberId(null);
    }
  };

  const deleteMember = async (member: GuestMember) => {
    if (readOnly || savingMemberId) return;
    if (!window.confirm("למחוק את המשתתף מהפירוט האישי?")) return;
    setSavingMemberId(member.id);
    try {
      await onDeleteMember(member.id);
    } finally {
      setSavingMemberId(null);
    }
  };

  const updateDraft = (id: string, patch: Partial<MemberDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? toDraft()), ...patch } }));
  };

  if (!guest) return null;

  return (
    <Dialog open={open} onOpenChange={(value) => (!value ? onClose() : undefined)}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>פרטי קבוצה</DialogTitle>
          <DialogDescription>
            עריכת פרטי ההזמנה ופירוט אישי אופציונלי למשתתפים בקבוצה.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3 rounded-xl border border-border p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm sm:col-span-2">
                <span className="mb-1 block text-muted-foreground">שם קבוצה *</span>
                <input
                  className={field}
                  value={fullName}
                  disabled={readOnly}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">מספר מוזמנים</span>
                <input
                  type="number"
                  min={Math.max(1, members.length)}
                  className={field}
                  value={groupSize}
                  disabled={readOnly}
                  onChange={(event) => {
                    const next = Number(event.target.value) || 1;
                    setGroupSize(next);
                    setGroupError(
                      next < members.length
                        ? `אי אפשר להקטין את הקבוצה לפחות מ-${members.length} משתתפים שכבר פורטו.`
                        : "",
                    );
                  }}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">צד</span>
                <select
                  className={field}
                  value={side}
                  disabled={readOnly}
                  onChange={(event) => setSide(event.target.value as GuestSide)}
                >
                  {SIDES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">טלפון</span>
                <input
                  className={field}
                  value={phone}
                  disabled={readOnly}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">מייל</span>
                <input
                  className={field}
                  value={email}
                  disabled={readOnly}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
            </div>

            <details className="rounded-lg bg-secondary/30 p-3">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                פרטים נוספים
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">קטגוריית קבוצה</span>
                  <input
                    className={field}
                    value={groupCategory}
                    disabled={readOnly}
                    onChange={(event) => setGroupCategory(event.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">קרבה</span>
                  <input
                    className={field}
                    value={relationship}
                    disabled={readOnly}
                    onChange={(event) => setRelationship(event.target.value)}
                  />
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={needsTransport}
                    disabled={readOnly}
                    onChange={(event) => setNeedsTransport(event.target.checked)}
                  />
                  צריכים הסעה
                </label>
                {needsTransport && (
                  <label className="block text-sm">
                    <span className="mb-1 block text-muted-foreground">נקודת איסוף</span>
                    <input
                      className={field}
                      value={pickupLocation}
                      disabled={readOnly}
                      onChange={(event) => setPickupLocation(event.target.value)}
                    />
                  </label>
                )}
                <label className="block text-sm sm:col-span-2">
                  <span className="mb-1 block text-muted-foreground">הערות</span>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    value={notes}
                    disabled={readOnly}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            </details>

            {groupError && <div className="text-sm text-destructive">{groupError}</div>}
            {!readOnly && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={saveGroup}
                  disabled={!canSaveGroup}
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-rose px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {savingGroup && <Loader2 size={16} className="animate-spin" />}
                  שמור פרטי קבוצה
                </button>
              </div>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-border p-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">פירוט אישי</h3>
              <p className="text-xs text-muted-foreground">
                {members.length} מתוך {guest.group_size} משתתפים פורטו.
              </p>
            </div>

            {loadingMembers ? (
              <div className="flex min-h-20 items-center justify-center">
                <Loader2 className="size-5 animate-spin text-rose" />
              </div>
            ) : sortedMembers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                טרם הוספתם פירוט אישי לקבוצה. אפשר להשאיר את הקבוצה כפי שהיא או לפרט את המשתתפים.
              </div>
            ) : (
              <div className="space-y-3">
                {sortedMembers.map((member) => {
                  const draft = drafts[member.id] ?? toDraft(member);
                  return (
                    <div key={member.id} className="rounded-xl bg-secondary/30 p-3">
                      <MemberFields
                        draft={draft}
                        disabled={readOnly}
                        onChange={(patch) => updateDraft(member.id, patch)}
                      />
                      {!readOnly && (
                        <div className="mt-3 flex flex-wrap justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => deleteMember(member)}
                            disabled={savingMemberId === member.id}
                            className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                          >
                            <Trash2 size={14} /> מחק
                          </button>
                          <button
                            type="button"
                            onClick={() => updateMember(member)}
                            disabled={!!savingMemberId}
                            className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs hover:bg-secondary disabled:opacity-50"
                          >
                            {savingMemberId === member.id && (
                              <Loader2 size={14} className="animate-spin" />
                            )}
                            שמור משתתף
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!readOnly && (
              <div className="rounded-xl border border-border p-3">
                <MemberFields
                  draft={newMember}
                  disabled={memberLimitReached || !!savingMemberId}
                  onChange={(patch) => setNewMember((prev) => ({ ...prev, ...patch }))}
                />
                {memberLimitReached && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    הגעתם למספר המשתתפים שהוגדר לקבוצה. הגדילו את מספר המוזמנים כדי להוסיף עוד.
                  </div>
                )}
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={addMember}
                    disabled={memberLimitReached || !!savingMemberId}
                    className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-gold/20 px-4 text-sm font-medium text-foreground ring-1 ring-gold/40 hover:bg-gold/30 disabled:opacity-50"
                  >
                    {savingMemberId === "new" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Plus size={16} />
                    )}
                    הוסף משתתף
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MemberFields({
  draft,
  disabled,
  onChange,
}: {
  draft: MemberDraft;
  disabled?: boolean;
  onChange: (patch: Partial<MemberDraft>) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm sm:col-span-2">
        <span className="mb-1 block text-muted-foreground">שם משתתף</span>
        <input
          className={field}
          value={draft.full_name}
          disabled={disabled}
          onChange={(event) => onChange({ full_name: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">גיל</span>
        <select
          className={field}
          value={draft.age_group}
          disabled={disabled}
          onChange={(event) => onChange({ age_group: event.target.value as GuestAgeGroup | "" })}
        >
          <option value="">לא צוין</option>
          {GUEST_AGE_GROUPS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">מנה</span>
        <select
          className={field}
          value={draft.meal_preference}
          disabled={disabled}
          onChange={(event) =>
            onChange({ meal_preference: event.target.value as GuestMealPreference | "" })
          }
        >
          <option value="">לא צוין</option>
          {GUEST_MEAL_PREFERENCES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">הערות תזונה</span>
        <input
          className={field}
          value={draft.dietary_notes}
          disabled={disabled}
          onChange={(event) => onChange({ dietary_notes: event.target.value })}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-muted-foreground">נגישות</span>
        <input
          className={field}
          value={draft.accessibility_notes}
          disabled={disabled}
          onChange={(event) => onChange({ accessibility_notes: event.target.value })}
        />
      </label>
    </div>
  );
}
