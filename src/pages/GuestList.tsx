import { useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus, Upload, PartyPopper, List } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { AppTopBar } from "@/components/AppTopBar";
import { useGuests, type GuestFilter } from "@/hooks/useGuests";
import { GuestStats } from "@/components/guests/GuestStats";
import { GuestTable } from "@/components/guests/GuestTable";
import { AddGuestModal } from "@/components/guests/AddGuestModal";
import { ImportGuestModal } from "@/components/guests/ImportGuestModal";
import { WeddingDayMode } from "@/components/guests/WeddingDayMode";
import { ExportMenu } from "@/components/guests/ExportMenu";

const FILTERS: { key: GuestFilter; label: string }[] = [
  { key: "all", label: "הכל" },
  { key: "arrived", label: "הגיעו" },
  { key: "not_arrived", label: "לא הגיעו" },
  { key: "pending", label: "טרם סומנו" },
  { key: "חתן", label: "צד חתן" },
  { key: "כלה", label: "צד כלה" },
  { key: "משותף", label: "משותף" },
];

export default function GuestList() {
  const { session } = useAuth();
  const [eventId, setEventId] = useState<string | null>(null);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [dayMode, setDayMode] = useState(() => localStorage.getItem("wb-day-mode") === "1");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);

  useEffect(() => {
    localStorage.setItem("wb-day-mode", dayMode ? "1" : "0");
  }, [dayMode]);

  useEffect(() => {
    if (!session?.user) return;
    (async () => {
      const { data: ev } = await supabase
        .from("events")
        .select("id")
        .eq("owner_id", session.user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!ev) return;
      setEventId(ev.id);
      const [{ data: exp }, { data: gs }] = await Promise.all([
        supabase.from("expenses").select("price,meal_price").eq("event_id", ev.id),
        supabase
          .from("guest_settings")
          .select("total_invited,attendance_rate,reserve")
          .eq("event_id", ev.id)
          .maybeSingle(),
      ]);
      const expected = gs
        ? Math.round((gs.total_invited * gs.attendance_rate) / 100) + gs.reserve
        : 0;
      setTotalExpenses(
        (exp ?? []).reduce(
          (s, e) => s + (e.meal_price ? Number(e.meal_price) * expected : Number(e.price || 0)),
          0,
        ),
      );
    })();
  }, [session?.user]);

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
  } = useGuests(eventId);

  const dayStats = useMemo(
    () => ({ arrivedCount: stats.arrivedCount, totalInvited: stats.totalInvited, totalGifts: stats.totalGifts }),
    [stats],
  );

  if (!eventId || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-rose" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <AppTopBar />
      <main className="mx-auto max-w-6xl px-3 py-5 sm:px-4 md:px-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl text-foreground sm:text-3xl">רשימת המוזמנים</h1>
            <p className="text-sm text-muted-foreground">ניהול הגעה, מתנות וסיכום כספי</p>
          </div>
          <button
            onClick={() => setDayMode((v) => !v)}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium ring-1 ${
              dayMode ? "bg-rose text-white ring-rose" : "bg-card text-foreground ring-border hover:bg-secondary"
            }`}
          >
            {dayMode ? <List size={16} /> : <PartyPopper size={16} />}
            {dayMode ? "חזרה לניהול" : "מצב יום החתונה"}
          </button>
        </header>

        {dayMode ? (
          <WeddingDayMode guests={allGuests} stats={dayStats} onUpdate={updateGuest} />
        ) : (
          <div className="space-y-5">
            <GuestStats stats={stats} totalExpenses={totalExpenses} />

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-rose px-4 text-sm font-medium text-white hover:bg-rose/90"
              >
                <UserPlus size={16} /> הוסף אורח
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-4 text-sm hover:bg-secondary"
              >
                <Upload size={16} /> ייבוא רשימה
              </button>
              <div className="ms-auto">
                <ExportMenu guests={allGuests} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="חיפוש לפי שם או טלפון..."
                className="min-h-10 w-full rounded-xl border border-border bg-card px-3 text-sm sm:w-64"
              />
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
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

            <GuestTable guests={guests} onUpdate={updateGuest} onDelete={deleteGuest} />
          </div>
        )}
      </main>

      <AddGuestModal open={showAdd} onClose={() => setShowAdd(false)} onAdd={addGuest} />
      <ImportGuestModal open={showImport} onClose={() => setShowImport(false)} onImport={importGuests} />
    </div>
  );
}
