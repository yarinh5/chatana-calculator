import { useState } from "react";
import { X } from "lucide-react";
import { SIDES, type GuestSide, type NewGuest } from "@/hooks/useGuests";

export function AddGuestModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (g: NewGuest) => boolean | void | Promise<boolean | void>;
}) {
  const [fullName, setFullName] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [side, setSide] = useState<GuestSide>("משותף");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [groupCategory, setGroupCategory] = useState("");
  const [relationship, setRelationship] = useState("");
  const [needsTransport, setNeedsTransport] = useState(false);
  const [pickupLocation, setPickupLocation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!open) return null;

  const submit = async () => {
    if (!fullName.trim() || submitting) return;
    setSubmitting(true);
    try {
      const ok = await onAdd({
        full_name: fullName.trim(),
        group_size: Math.max(1, groupSize || 1),
        side,
        phone: phone.trim() || null,
        email: email.trim() || null,
        notes: notes.trim() || null,
        group_category: groupCategory.trim() || null,
        relationship: relationship.trim() || null,
        needs_transport: needsTransport,
        pickup_location: needsTransport ? pickupLocation.trim() || null : null,
      });
      if (ok === false) return;
      setFullName("");
      setGroupSize(1);
      setSide("משותף");
      setPhone("");
      setEmail("");
      setNotes("");
      setGroupCategory("");
      setRelationship("");
      setNeedsTransport(false);
      setPickupLocation("");
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const field = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">הוסף אורח</h3>
          <button
            onClick={onClose}
            aria-label="סגור"
            className="rounded-full p-2 hover:bg-secondary"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">שם מלא *</span>
            <input
              className={field}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">מספר אנשים</span>
              <input
                type="number"
                min={1}
                className={field}
                value={groupSize}
                onChange={(e) => setGroupSize(Number(e.target.value))}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-muted-foreground">צד</span>
              <select
                className={field}
                value={side}
                onChange={(e) => setSide(e.target.value as GuestSide)}
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">טלפון</span>
            <input className={field} value={phone} onChange={(e) => setPhone(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">מייל</span>
            <input className={field} value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">הערות (ילדים, דיאטה וכו׳)</span>
            <input className={field} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
          <details className="rounded-xl border border-border bg-background/50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              פרטים נוספים
            </summary>
            <div className="mt-3 space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">קטגוריית קבוצה</span>
                <input
                  className={field}
                  value={groupCategory}
                  onChange={(e) => setGroupCategory(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-muted-foreground">קרבה</span>
                <input
                  className={field}
                  value={relationship}
                  onChange={(e) => setRelationship(e.target.value)}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={needsTransport}
                  onChange={(e) => setNeedsTransport(e.target.checked)}
                />
                צריכים הסעה
              </label>
              {needsTransport && (
                <label className="block text-sm">
                  <span className="mb-1 block text-muted-foreground">נקודת איסוף</span>
                  <input
                    className={field}
                    value={pickupLocation}
                    onChange={(e) => setPickupLocation(e.target.value)}
                  />
                </label>
              )}
            </div>
          </details>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-4 text-sm hover:bg-secondary"
          >
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={!fullName.trim() || submitting}
            className="min-h-11 rounded-xl bg-rose px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            הוסף לרשימה
          </button>
        </div>
      </div>
    </div>
  );
}
