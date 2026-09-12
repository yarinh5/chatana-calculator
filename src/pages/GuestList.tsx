import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, Upload, PartyPopper, List } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useWorkspace } from "@/hooks/useWorkspace";
import { AppTopBar } from "@/components/AppTopBar";
import { useGuests, type GuestFilter } from "@/hooks/useGuests";
import { useGuestMembers } from "@/hooks/useGuestMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { GuestStats } from "@/components/guests/GuestStats";
import { GuestTable } from "@/components/guests/GuestTable";
import { AddGuestModal } from "@/components/guests/AddGuestModal";
import { ImportGuestModal } from "@/components/guests/ImportGuestModal";
import { WeddingDayMode } from "@/components/guests/WeddingDayMode";
import { ExportMenu } from "@/components/guests/ExportMenu";
import { GuestDetailsDialog } from "@/components/guests/GuestDetailsDialog";
import { UpgradeDialog } from "@/components/subscription/UpgradeDialog";
import type { Guest } from "@/hooks/useGuests";
import type { UpgradeReason } from "@/lib/subscription";

const FILTERS: { key: GuestFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "arrived", label: "הגיעו" },
  { key: "not_arrived", label: "לא הגיעו" },
  { key: "pending", label: "טרם סומנו" },
  { key: "חתן", label: "צד חתן" },
  { key: "כלה", label: "צד כלה" },
  { key: "משותף", label: "משותף" },
];

type GuestListProps = {
  eventIdOverride?: string | null;
  forceReadOnly?: boolean;
  topBar?: ReactNode;
  banner?: ReactNode;
  title?: string;
  subtitle?: string;
};

export default function GuestList({
  eventIdOverride,
  forceReadOnly = false,
  topBar,
  banner,
  title = "רשימת המוזמנים",
  subtitle = "ניהול הגעה, מתנות וסיכום כספי",
}: GuestListProps = {}) {
  const { session } = useAuth();
  const workspace = useWorkspace();
  const userId = session?.user.id ?? null;
  const [eventId, setEventId] = useState<string | null>(null);
  const [eventLoading, setEventLoading] = useState(true);
  const [eventError, setEventError] = useState<string | null>(null);
  const [hasEvent, setHasEvent] = useState(false);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [dayMode, setDayMode] = useState(() => localStorage.getItem("wb-day-mode") === "1");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<UpgradeReason | null>(null);
  const adminView = !!eventIdOverride || forceReadOnly;
  const canViewGuests = adminView || workspace.can("guests_view");
  const canEditGuests = !adminView && workspace.can("guests_edit");
  const canViewGifts = adminView || workspace.can("gifts_view");
  const canEditGifts = !adminView && workspace.can("gifts_edit");
  const canViewAttendance = adminView || workspace.can("wedding_day_view");
  const canEditAttendance = !adminView && workspace.can("wedding_day_edit");
  const canViewBudget = adminView || workspace.can("budget_view");
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const effectiveReadOnly =
    forceReadOnly ||
    !canEditGuests ||
    subscription.loading ||
    !!subscription.error ||
    subscription.isExpired;
  const attendanceLocked =
    !effectiveReadOnly && (!canEditAttendance || !subscription.canUseAttendance);
  const giftsReadOnly = effectiveReadOnly || !canEditGifts;
  const expiredReason: UpgradeReason =
    subscription.status === "premium_expired" ? "premium_expired" : "trial_expired";

  useEffect(() => {
    localStorage.setItem("wb-day-mode", dayMode ? "1" : "0");
  }, [dayMode]);

  useEffect(() => {
    if (forceReadOnly && dayMode) setDayMode(false);
  }, [dayMode, forceReadOnly]);

  useEffect(() => {
    if (dayMode && !subscription.loading && !subscription.canUseAttendance) setDayMode(false);
  }, [dayMode, subscription.canUseAttendance, subscription.loading]);

  const loadEvent = useCallback(async () => {
    if (!userId && !eventIdOverride) return;
    if (!eventIdOverride && workspace.loading) {
      setEventLoading(true);
      return;
    }
    setEventLoading(true);
    setEventError(null);
    try {
      const eventResult = eventIdOverride
        ? { data: { id: eventIdOverride }, error: null }
        : workspace.loading
          ? { data: null, error: null }
          : {
              data: workspace.activeEventId ? { id: workspace.activeEventId } : null,
              error: workspace.error,
            };

      if (eventResult.error) throw eventResult.error;

      const ev = eventResult.data;

      if (!ev) {
        setEventId(null);
        setHasEvent(false);
        setTotalExpenses(0);
        return;
      }

      setEventId(ev.id);
      setHasEvent(true);
      if (canViewBudget) {
        const [expensesResult, guestSettingsResult] = await Promise.all([
          supabase.from("expenses").select("price,meal_price").eq("event_id", ev.id),
          supabase
            .from("guest_settings")
            .select("total_invited,attendance_rate,reserve")
            .eq("event_id", ev.id)
            .maybeSingle(),
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (guestSettingsResult.error) throw guestSettingsResult.error;

        const exp = expensesResult.data;
        const gs = guestSettingsResult.data;
        const expected = gs
          ? Math.round((gs.total_invited * gs.attendance_rate) / 100) + gs.reserve
          : 0;
        setTotalExpenses(
          (exp ?? []).reduce(
            (s, e) => s + (e.meal_price ? Number(e.meal_price) * expected : Number(e.price || 0)),
            0,
          ),
        );
      } else {
        setTotalExpenses(0);
      }
    } catch {
      setEventError("לא הצלחנו לטעון את האירוע.");
      setEventId(null);
      setHasEvent(false);
    } finally {
      setEventLoading(false);
    }
  }, [
    canViewBudget,
    eventIdOverride,
    userId,
    workspace.activeEventId,
    workspace.error,
    workspace.loading,
  ]);

  useEffect(() => {
    void loadEvent();
  }, [loadEvent]);

  const guestMembers = useGuestMembers(eventId);
  const memberSearchByGuestId = useMemo(
    () =>
      guestMembers.members.reduce<Record<string, string>>((acc, member) => {
        const current = acc[member.guest_id] ?? "";
        acc[member.guest_id] = [current, member.full_name].filter(Boolean).join(" ");
        return acc;
      }, {}),
    [guestMembers.members],
  );

  const {
    allGuests,
    guests,
    loading,
    stats,
    searchTerm,
    setSearchTerm,
    filter,
    setFilter,
    addGuest,
    updateGuest,
    deleteGuest,
    importGuests,
  } = useGuests(eventId, effectiveReadOnly, memberSearchByGuestId);

  useEffect(() => {
    if (!canViewAttendance && ["arrived", "not_arrived", "pending"].includes(String(filter))) {
      setFilter("all");
    }
  }, [canViewAttendance, filter, setFilter]);

  const selectedGuest = useMemo(
    () => allGuests.find((guest) => guest.id === selectedGuestId) ?? null,
    [allGuests, selectedGuestId],
  );

  const dayStats = useMemo(
    () => ({
      arrivedCount: stats.arrivedCount,
      totalInvited: stats.totalInvited,
      totalGifts: stats.totalGifts,
    }),
    [stats],
  );

  const openBlocked = (reason: UpgradeReason = "generic") => {
    setUpgradeReason(subscription.isExpired ? expiredReason : reason);
  };
  const visibleFilters = useMemo(
    () =>
      FILTERS.filter((filterOption) =>
        canViewAttendance
          ? true
          : !["arrived", "not_arrived", "pending"].includes(String(filterOption.key)),
      ),
    [canViewAttendance],
  );

  const handleUpdateGuest = async (id: string, updates: Partial<Guest>) => {
    const touchesAttendance = updates.arrived !== undefined || updates.arrived_count !== undefined;
    const touchesGift = updates.gift_amount !== undefined || updates.payment_method !== undefined;
    if (effectiveReadOnly) {
      openBlocked(subscription.isExpired ? expiredReason : "generic");
      return false;
    }
    if (touchesAttendance && attendanceLocked) {
      openBlocked("attendance");
      return false;
    }
    if (touchesGift && !canEditGifts) {
      toast.error("אין הרשאה לעריכת מתנות");
      return false;
    }
    return await updateGuest(id, updates);
  };

  const handleDeleteGuest = async (id: string) => {
    if (effectiveReadOnly) {
      openBlocked(subscription.isExpired ? expiredReason : "generic");
      return false;
    }
    const ok = await deleteGuest(id);
    if (ok) {
      if (selectedGuestId === id) setSelectedGuestId(null);
      await guestMembers.refresh();
    }
    return ok;
  };

  const handleAddGuest = async (...args: Parameters<typeof addGuest>) => {
    if (effectiveReadOnly) {
      openBlocked(subscription.isExpired ? expiredReason : "generic");
      return false;
    }
    return await addGuest(...args);
  };

  const handleImportGuests = async (...args: Parameters<typeof importGuests>) => {
    if (effectiveReadOnly) {
      openBlocked(subscription.isExpired ? expiredReason : "generic");
      return false;
    }
    return await importGuests(...args);
  };

  if (eventLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-rose" />
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        {topBar ?? <AppTopBar subscription={subscription} />}
        {banner}
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="rounded-2xl border border-destructive/20 bg-card p-8 shadow-sm">
            <h1 className="font-display text-2xl text-foreground">שגיאה בטעינת האירוע</h1>
            <p className="mt-2 text-sm text-muted-foreground">{eventError}</p>
            <button
              type="button"
              onClick={() => void loadEvent()}
              className="mt-5 rounded-xl bg-rose px-4 py-2 text-sm font-medium text-white hover:bg-rose/90"
            >
              נסה שוב
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (!hasEvent || !eventId) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        {topBar ?? <AppTopBar subscription={subscription} />}
        {banner}
        <main className="mx-auto max-w-3xl px-4 py-10 text-center">
          <div className="rounded-2xl border border-dashed border-border bg-card p-8">
            <h1 className="font-display text-2xl text-foreground">אין אירוע להצגה</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              לאחר יצירת אירוע תוכלו לנהל כאן את רשימת המוזמנים.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (loading || subscription.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-rose" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {topBar ?? <AppTopBar subscription={subscription} />}
      {banner}
      {subscription.error && (
        <div className="border-b border-destructive/20 bg-destructive/10 text-destructive">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm md:px-6">
            <span>לא הצלחנו לטעון את מצב המנוי. עריכה חסומה עד שהבדיקה תושלם.</span>
            <button
              type="button"
              onClick={() => void subscription.refresh()}
              className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-secondary"
            >
              נסה שוב
            </button>
          </div>
        </div>
      )}
      {subscription.isExpired && (
        <div className="border-b border-gold/30 bg-gold/15 text-foreground">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm md:px-6">
            <span className="font-semibold">
              {subscription.status === "premium_expired"
                ? "תקופת ה-Premium הסתיימה"
                : "תקופת הניסיון הסתיימה"}
            </span>
            <span className="text-xs text-muted-foreground">
              המידע שלכם שמור. ניתן לצפות בנתונים ולשדרג כדי לחזור לעריכה.
            </span>
          </div>
        </div>
      )}
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 md:px-6">
        {!canViewGuests && (
          <div className="mb-5 rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            אין לכם הרשאה לצפייה ברשימת המוזמנים בסביבת העבודה הזו.
          </div>
        )}
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-foreground sm:text-3xl">{title}</h1>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
          {!forceReadOnly && canViewAttendance && (
            <button
              onClick={() => {
                if (!canEditAttendance || !subscription.canUseAttendance) {
                  openBlocked("attendance");
                  return;
                }
                setDayMode((v) => !v);
              }}
              className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ${
                dayMode
                  ? "bg-rose text-white ring-rose"
                  : "bg-card text-foreground ring-border hover:bg-secondary"
              }`}
            >
              {dayMode ? <List size={16} /> : <PartyPopper size={16} />}
              {dayMode ? "חזרה לניהול" : "מצב יום החתונה"}
            </button>
          )}
        </header>

        {!canViewGuests ? null : dayMode ? (
          <WeddingDayMode
            guests={allGuests}
            stats={dayStats}
            onUpdate={handleUpdateGuest}
            readOnly={effectiveReadOnly}
            attendanceLocked={attendanceLocked}
            onAttendanceBlocked={() => openBlocked("attendance")}
            canViewGifts={canViewGifts}
            giftsReadOnly={giftsReadOnly}
          />
        ) : (
          <div className="space-y-5">
            <GuestStats
              stats={stats}
              totalExpenses={totalExpenses}
              canViewGifts={canViewGifts}
              canViewAttendance={canViewAttendance}
              canViewBudget={canViewBudget}
            />

            <div className="flex flex-wrap items-center gap-2">
              {!forceReadOnly && canEditGuests && (
                <>
                  <button
                    onClick={() =>
                      effectiveReadOnly ? openBlocked(expiredReason) : setShowAdd(true)
                    }
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose px-4 text-sm font-medium text-white hover:bg-rose/90"
                  >
                    <UserPlus size={16} /> הוסף אורח
                  </button>
                  <button
                    onClick={() =>
                      effectiveReadOnly ? openBlocked(expiredReason) : setShowImport(true)
                    }
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm hover:bg-secondary"
                  >
                    <Upload size={16} /> ייבוא רשימה
                  </button>
                </>
              )}
              <div className="ms-auto">
                <ExportMenu
                  guests={allGuests}
                  membersByGuest={guestMembers.membersByGuest}
                  canViewGifts={canViewGifts}
                  canViewAttendance={canViewAttendance}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חיפוש לפי שם, טלפון או פרטי קבוצה..."
                className="min-h-10 w-full rounded-xl border border-border bg-card px-3 text-sm sm:w-64"
              />
              <div className="flex flex-wrap gap-1.5">
                {visibleFilters.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`min-h-9 rounded-full px-3 text-xs ring-1 ${
                      filter === f.key
                        ? "bg-gold/20 text-foreground ring-gold"
                        : "bg-card text-muted-foreground ring-border hover:bg-secondary"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {guestMembers.error && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                <span>לא הצלחנו לטעון את הפירוט האישי של המוזמנים.</span>
                <button
                  type="button"
                  onClick={() => void guestMembers.refresh()}
                  className="rounded-full bg-card px-3 py-1 text-xs font-semibold text-foreground ring-1 ring-border hover:bg-secondary"
                >
                  נסה שוב
                </button>
              </div>
            )}

            <GuestTable
              guests={guests}
              membersByGuest={guestMembers.membersByGuest}
              onUpdate={handleUpdateGuest}
              onDelete={handleDeleteGuest}
              onOpenDetails={(guest) => setSelectedGuestId(guest.id)}
              readOnly={effectiveReadOnly}
              attendanceLocked={attendanceLocked}
              onAttendanceBlocked={() => openBlocked("attendance")}
              canViewGifts={canViewGifts}
              canEditGifts={canEditGifts}
              canViewAttendance={canViewAttendance}
            />
          </div>
        )}
      </main>

      <AddGuestModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={handleAddGuest} />
      <ImportGuestModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onImport={handleImportGuests}
      />
      <GuestDetailsDialog
        open={!!selectedGuest}
        guest={selectedGuest}
        members={selectedGuest ? (guestMembers.membersByGuest[selectedGuest.id] ?? []) : []}
        loadingMembers={guestMembers.loading}
        readOnly={effectiveReadOnly}
        onClose={() => setSelectedGuestId(null)}
        onUpdateGuest={handleUpdateGuest}
        onAddMember={async (guestId, values) => {
          if (effectiveReadOnly) {
            openBlocked(subscription.isExpired ? expiredReason : "generic");
            return false;
          }
          return await guestMembers.addMember(guestId, values);
        }}
        onUpdateMember={async (id, updates) => {
          if (effectiveReadOnly) {
            openBlocked(subscription.isExpired ? expiredReason : "generic");
            return false;
          }
          return await guestMembers.updateMember(id, updates);
        }}
        onDeleteMember={async (id) => {
          if (effectiveReadOnly) {
            openBlocked(subscription.isExpired ? expiredReason : "generic");
            return false;
          }
          return await guestMembers.deleteMember(id);
        }}
      />
      <UpgradeDialog
        open={!!upgradeReason}
        reason={upgradeReason ?? "generic"}
        onClose={() => setUpgradeReason(null)}
      />
    </div>
  );
}
