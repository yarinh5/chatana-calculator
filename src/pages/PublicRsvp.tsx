import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  RSVP_STATUS_LABELS,
  formatWeddingDate,
  getConfirmedCountForStatus,
  validateConfirmedCount,
  type PublicRsvp,
  type RsvpStatus,
} from "@/lib/rsvp";

type PublicDraft = {
  status: RsvpStatus;
  confirmedCount: number | null;
  note: string;
  dietaryNotes: string;
};

export default function PublicRsvp() {
  const { token } = useParams();
  const [draft, setDraft] = useState<PublicDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PublicDraft | null>(null);

  const query = useQuery<PublicRsvp | null, Error>({
    queryKey: ["public-rsvp", token],
    enabled: !!token,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase.rpc("get_public_rsvp", { _token: token });
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  const rsvp = query.data;

  useEffect(() => {
    if (!rsvp) {
      setDraft(null);
      setSaved(null);
      return;
    }
    setDraft({
      status: rsvp.status,
      confirmedCount: rsvp.confirmed_count,
      note: rsvp.note ?? "",
      dietaryNotes: rsvp.dietary_notes ?? "",
    });
    setSaved(null);
  }, [rsvp]);

  const validation = useMemo(() => {
    if (!draft || !rsvp) return null;
    return validateConfirmedCount(draft.status, rsvp.group_size, draft.confirmedCount);
  }, [draft, rsvp]);
  const isResponseStatus =
    draft?.status === "confirmed" ||
    draft?.status === "declined" ||
    draft?.status === "partially_confirmed";

  const submit = async () => {
    if (!token || !rsvp || !draft || !rsvp.can_submit || validation || saving) return;
    const confirmedCount = getConfirmedCountForStatus(
      draft.status,
      rsvp.group_size,
      draft.confirmedCount,
    );
    if (confirmedCount === null) {
      toast.error("בחרו האם אתם מגיעים");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc("submit_public_rsvp", {
        _confirmed_count: confirmedCount,
        _dietary_notes: rsvp.rsvp_collect_dietary ? draft.dietaryNotes : null,
        _note: draft.note,
        _token: token,
      });
      const savedRow = data?.[0];
      if (error || !savedRow) {
        toast.error("לא הצלחנו לשמור את אישור ההגעה");
        return;
      }
      const savedDraft = {
        ...draft,
        status: savedRow.status,
        confirmedCount: savedRow.confirmed_count,
      };
      setDraft(savedDraft);
      setSaved(savedDraft);
      toast.success("אישור ההגעה נשמר");
      await query.refetch();
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) {
    return <PublicState title="טוען את ההזמנה" loading />;
  }

  if (query.error) {
    return (
      <PublicState
        title="לא הצלחנו לטעון את הקישור"
        text="אפשר לנסות שוב בעוד רגע."
        action={() => void query.refetch()}
      />
    );
  }

  if (!rsvp || !draft) {
    return (
      <PublicState
        title="הקישור אינו זמין או שפג תוקפו"
        text="אם נראה שזו טעות, בקשו קישור חדש מהמארחים."
      />
    );
  }

  return (
    <div className="min-h-screen bg-background px-4 py-6" dir="rtl">
      <main className="mx-auto max-w-xl">
        <section className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border sm:p-7">
          <div className="text-center">
            <p className="text-sm text-muted-foreground">{formatWeddingDate(rsvp.wedding_date)}</p>
            <h1 className="mt-1 font-display text-3xl text-foreground">{rsvp.event_name}</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              הזמנה עבור <span className="font-semibold text-foreground">{rsvp.guest_name}</span> ·{" "}
              {rsvp.group_size} מוזמנים
            </p>
          </div>

          {!rsvp.can_submit && (
            <div className="mt-5 rounded-xl border border-gold/30 bg-gold/10 p-3 text-sm">
              לא ניתן לעדכן את האישור כרגע. המידע הקיים נשמר.
            </div>
          )}

          {saved && (
            <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
              נשמר: {RSVP_STATUS_LABELS[saved.status]}
              {saved.confirmedCount !== null ? ` · ${saved.confirmedCount} מגיעים` : ""}
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div className="grid gap-2 sm:grid-cols-3">
              <Choice
                label="מגיעים"
                active={draft.status === "confirmed"}
                disabled={!rsvp.can_submit}
                onClick={() =>
                  setDraft((prev) =>
                    prev ? { ...prev, status: "confirmed", confirmedCount: rsvp.group_size } : prev,
                  )
                }
              />
              <Choice
                label="לא מגיעים"
                active={draft.status === "declined"}
                disabled={!rsvp.can_submit}
                onClick={() =>
                  setDraft((prev) =>
                    prev ? { ...prev, status: "declined", confirmedCount: 0 } : prev,
                  )
                }
              />
              <Choice
                label="חלקית"
                active={draft.status === "partially_confirmed"}
                disabled={!rsvp.can_submit || rsvp.group_size <= 1}
                onClick={() =>
                  setDraft((prev) =>
                    prev ? { ...prev, status: "partially_confirmed", confirmedCount: 1 } : prev,
                  )
                }
              />
            </div>

            {draft.status === "partially_confirmed" && (
              <label className="block text-sm font-medium">
                כמה מגיעים?
                <input
                  type="number"
                  min={1}
                  max={Math.max(rsvp.group_size - 1, 1)}
                  value={draft.confirmedCount ?? ""}
                  disabled={!rsvp.can_submit}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, confirmedCount: Number(event.target.value) || null } : prev,
                    )
                  }
                  className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3"
                />
              </label>
            )}
            {validation && <p className="text-sm text-destructive">{validation}</p>}

            <label className="block text-sm font-medium">
              הערה למארחים
              <textarea
                value={draft.note}
                disabled={!rsvp.can_submit}
                onChange={(event) =>
                  setDraft((prev) => (prev ? { ...prev, note: event.target.value } : prev))
                }
                maxLength={1000}
                className="mt-1 min-h-24 w-full rounded-xl border border-input bg-background p-3"
              />
            </label>

            {rsvp.rsvp_collect_dietary && (
              <label className="block text-sm font-medium">
                הערות תזונתיות
                <textarea
                  value={draft.dietaryNotes}
                  disabled={!rsvp.can_submit}
                  onChange={(event) =>
                    setDraft((prev) =>
                      prev ? { ...prev, dietaryNotes: event.target.value } : prev,
                    )
                  }
                  maxLength={1000}
                  className="mt-1 min-h-24 w-full rounded-xl border border-input bg-background p-3"
                />
              </label>
            )}

            <Button
              className="min-h-12 w-full"
              onClick={() => void submit()}
              disabled={!rsvp.can_submit || saving || !!validation || !isResponseStatus}
            >
              {saving ? <Loader2 className="animate-spin" /> : <Check />}
              שמירת אישור הגעה
            </Button>
          </div>
        </section>
      </main>
    </div>
  );
}

function Choice({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 rounded-xl border px-3 text-sm font-semibold transition ${
        active
          ? "border-rose bg-rose text-white"
          : "border-border bg-background text-foreground hover:bg-secondary"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {label}
    </button>
  );
}

function PublicState({
  title,
  text,
  loading,
  action,
}: {
  title: string;
  text?: string;
  loading?: boolean;
  action?: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4" dir="rtl">
      <div className="max-w-md rounded-2xl bg-card p-8 text-center ring-1 ring-border">
        {loading && <Loader2 className="mx-auto mb-3 size-7 animate-spin text-rose" />}
        <h1 className="font-display text-2xl text-foreground">{title}</h1>
        {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
        {action && (
          <Button className="mt-5" onClick={action}>
            <RefreshCw size={15} /> נסה שוב
          </Button>
        )}
      </div>
    </div>
  );
}
