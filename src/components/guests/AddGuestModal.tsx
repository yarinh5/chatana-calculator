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
  onAdd: (g: NewGuest) => void | Promise<void>;
}) {
  const [fullName, setFullName] = useState("");
  const [groupSize, setGroupSize] = useState(1);
  const [side, setSide] = useState<GuestSide>("משותף");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");

  if (!open) return null;

  const submit = async () => {
    if (!fullName.trim()) return;
    await onAdd({
      full_name: fullName.trim(),
      group_size: Math.max(1, groupSize || 1),
      side,
      phone: phone.trim() || null,
      email: email.trim() || null,
      notes: notes.trim() || null,
    });
    setFullName("");
    setGroupSize(1);
    setPhone("");
    setEmail("");
    setNotes("");
    onClose();
  };

  const field = "min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg text-foreground">הוסף אורח</h3>
          <button onClick={onClose} aria-label="סגור" className="rounded-full p-2 hover:bg-secondary">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted-foreground">שם מלא *</span>
            <input className={field} value={fullName} onChange={(e) => setFullName(e.target.value)} />
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
              <select className={field} value={side} onChange={(e) => setSide(e.target.value as GuestSide)}>
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
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="min-h-11 rounded-xl border border-border px-4 text-sm hover:bg-secondary">
            ביטול
          </button>
          <button
            onClick={submit}
            disabled={!fullName.trim()}
            className="min-h-11 rounded-xl bg-rose px-4 text-sm font-medium text-white disabled:opacity-50"
          >
            הוסף לרשימה
          </button>
        </div>
      </div>
    </div>
  );
}
