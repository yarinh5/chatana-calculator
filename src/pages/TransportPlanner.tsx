import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bus, Plus, Trash2 } from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useGuests } from "@/hooks/useGuests";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  addPickupRoutesToPlan,
  assessTransport,
  assignTransportGroup,
  normalizePickup,
  routeOccupancy,
  routesForPickupLocations,
  setRouteVehicle,
  type TransportGuest,
  type TransportPlan,
} from "@/lib/transport-domain";

const EMPTY_PLAN: TransportPlan = { vehicles: [], routes: [], assignments: [] };

export default function TransportPlanner() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("guests_view");
  const canEdit = canView && workspace.can("guests_edit") && subscription.canEdit;
  if (workspace.loading) return <State title="טוענים סביבת עבודה" />;
  if (workspace.error) return <State title="לא הצלחנו לטעון את סביבת העבודה" />;
  if (!workspace.activeWorkspace || !eventId) return <State title="אין סביבת עבודה פעילה" />;
  if (!canView) return <State title="אין לך הרשאה לצפייה בנתוני ההסעות של המוזמנים" />;
  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <AppTopBar subscription={subscription} />
      <Planner
        key={eventId}
        eventId={eventId}
        eventName={workspace.activeWorkspace.event_name}
        canEdit={canEdit}
        loadingPermission={subscription.loading}
        permissionError={!!subscription.error}
      />
    </div>
  );
}

function State({ title }: { title: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background p-4 text-center text-foreground"
    >
      {title}
    </div>
  );
}

function Planner({
  eventId,
  eventName,
  canEdit,
  loadingPermission,
  permissionError,
}: {
  eventId: string;
  eventName: string;
  canEdit: boolean;
  loadingPermission: boolean;
  permissionError: boolean;
}) {
  const guests = useGuests(eventId, true);
  const [plan, setPlan] = useState<TransportPlan>(EMPTY_PLAN);
  const [vehicleName, setVehicleName] = useState("");
  const [vehicleCapacity, setVehicleCapacity] = useState(20);
  const [selectedByRoute, setSelectedByRoute] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const transportGuests = useMemo<TransportGuest[]>(
    () =>
      guests.allGuests
        .filter((guest) => guest.needs_transport)
        .map((guest) => ({
          id: guest.id,
          name: guest.full_name,
          groupSize: guest.group_size,
          pickupLocation: guest.pickup_location,
        })),
    [guests.allGuests],
  );
  const summary = assessTransport(plan, transportGuests);
  const transportPeople = transportGuests.reduce((sum, guest) => sum + guest.groupSize, 0);
  const assignedPeople =
    transportPeople - summary.unassigned.reduce((sum, guest) => sum + guest.groupSize, 0);

  function addVehicle() {
    if (!canEdit) return;
    const capacity = Number(vehicleCapacity);
    if (!vehicleName.trim() || !Number.isSafeInteger(capacity) || capacity < 1) {
      setError("יש להזין שם רכב וקיבולת חיובית ושלמה");
      return;
    }
    setPlan((current) => ({
      ...current,
      vehicles: [
        ...current.vehicles,
        { id: crypto.randomUUID(), label: vehicleName.trim(), capacity },
      ],
    }));
    setVehicleName("");
    setVehicleCapacity(20);
    setError(null);
  }

  function addPickupRoutes() {
    if (!canEdit || guests.loading || guests.error) return;
    const additions = routesForPickupLocations(transportGuests, plan.routes);
    if (!additions.length) {
      setError("כבר קיימים מסלולים לכל נקודות האיסוף שהוגדרו.");
      return;
    }
    setPlan((current) => addPickupRoutesToPlan(current, transportGuests));
    setError(null);
  }

  function changeVehicle(routeId: string, vehicleId: string) {
    if (!canEdit) return;
    try {
      setPlan((current) => setRouteVehicle(current, routeId, vehicleId || null));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "שיוך הרכב נכשל");
    }
  }

  function addGroup(routeId: string) {
    if (!canEdit || guests.loading || guests.error) return;
    try {
      const next = assignTransportGroup(plan, transportGuests, selectedByRoute[routeId], routeId);
      setPlan(next);
      setSelectedByRoute((current) => ({ ...current, [routeId]: "" }));
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "שיבוץ ההסעה נכשל");
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{eventName}</p>
          <h1 className="font-display text-3xl">ניהול הסעות</h1>
        </div>
        <Link to="/guests" className="rounded-full border border-border px-4 py-2 text-sm">
          עריכת פרטי הסעה במוזמנים
        </Link>
      </div>
      <div role="status" className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
        זו טיוטת הסעות מקומית בלבד. מסלולים, רכבים ושיבוצים אינם נשמרים או משותפים, ויימחקו כשתעזבו
        את העמוד. אין כאן ניווט, תזמון נסיעות או הזמנת רכב אמיתית.
      </div>
      {!canEdit && (
        <p role="status" className="mb-4 rounded-xl bg-secondary p-3 text-sm">
          {loadingPermission
            ? "בודקים הרשאות עריכה..."
            : permissionError
              ? "לא הצלחנו לבדוק את מצב המנוי; העריכה חסומה."
              : "מצב צפייה בלבד. הרשאות הסעות יושלמו במסד."}
        </p>
      )}
      {guests.loading ? (
        <p className="rounded-xl bg-card p-4 text-sm">טוענים קבוצות מוזמנים...</p>
      ) : guests.error ? (
        <div role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
          <p>{guests.error}</p>
          <button type="button" onClick={() => void guests.reload()} className="underline">
            נסו שוב
          </button>
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["קבוצות להסעה", transportGuests.length],
              ["אנשים להסעה", transportPeople],
              ["שובצו", assignedPeople],
              ["טרם שובצו", transportPeople - assignedPeople],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          {error && (
            <p
              role="alert"
              className="mb-4 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {summary.missingPickup.length > 0 && (
            <div
              role="alert"
              className="mb-5 rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm"
            >
              <p>{summary.missingPickup.length} קבוצות צריכות הסעה אבל חסרה להן נקודת איסוף:</p>
              <p className="mt-1">{summary.missingPickup.map((guest) => guest.name).join(" · ")}</p>
              <Link to="/guests" className="mt-2 inline-block font-semibold underline">
                עדכנו נקודות איסוף ברשימת המוזמנים
              </Link>
            </div>
          )}
          {(summary.staleAssignments.length > 0 || summary.changedPickup.length > 0) && (
            <p
              role="alert"
              className="mb-5 rounded-xl bg-destructive/10 p-4 text-sm text-destructive"
            >
              נתוני המוזמנים השתנו מאז השיבוץ: {summary.staleAssignments.length} שיבוצים לקבוצות
              שאינן ברשימה ו־{summary.changedPickup.length} שיבוצים עם נקודת איסוף שונה. השיבוצים לא
              נמחקו; בדקו והסירו אותם במידת הצורך.
            </p>
          )}
          <section className="mb-5 rounded-2xl border border-border bg-card p-4">
            <h2 className="mb-3 font-semibold">
              <Bus size={18} className="ml-1 inline" /> רכבים בטיוטה
            </h2>
            <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <label className="text-sm">
                שם הרכב
                <input
                  value={vehicleName}
                  disabled={!canEdit}
                  onChange={(event) => setVehicleName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-40"
                />
              </label>
              <label className="text-sm">
                מקומות
                <input
                  type="number"
                  min="1"
                  value={vehicleCapacity}
                  disabled={!canEdit}
                  onChange={(event) => setVehicleCapacity(Number(event.target.value))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-40"
                />
              </label>
              <button
                type="button"
                disabled={!canEdit}
                onClick={addVehicle}
                className="mt-auto inline-flex items-center justify-center gap-1 rounded-lg bg-gold/20 px-3 py-2 text-sm ring-1 ring-gold/40 disabled:opacity-40"
              >
                <Plus size={15} /> הוסף רכב
              </button>
            </div>
            {!plan.vehicles.length ? (
              <p className="text-sm text-muted-foreground">עדיין אין רכבים בטיוטה.</p>
            ) : (
              <ul className="space-y-2">
                {plan.vehicles.map((vehicle) => (
                  <li
                    key={vehicle.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/50 p-2 text-sm"
                  >
                    <span>{vehicle.label}</span>
                    <div className="flex items-center gap-2">
                      <label>
                        קיבולת{" "}
                        <input
                          type="number"
                          min="1"
                          value={vehicle.capacity}
                          disabled={!canEdit}
                          onChange={(event) => {
                            const capacity = Number(event.target.value);
                            if (!Number.isSafeInteger(capacity) || capacity < 1) {
                              setError("קיבולת חייבת להיות חיובית ושלמה");
                              return;
                            }
                            setPlan((current) => ({
                              ...current,
                              vehicles: current.vehicles.map((item) =>
                                item.id === vehicle.id ? { ...item, capacity } : item,
                              ),
                            }));
                            setError(null);
                          }}
                          className="w-16 rounded border border-border bg-background px-2 py-1 disabled:opacity-40"
                        />
                      </label>
                      <button
                        type="button"
                        aria-label={`מחק רכב ${vehicle.label}`}
                        disabled={
                          !canEdit || plan.routes.some((route) => route.vehicleId === vehicle.id)
                        }
                        onClick={() =>
                          setPlan((current) => ({
                            ...current,
                            vehicles: current.vehicles.filter((item) => item.id !== vehicle.id),
                          }))
                        }
                        className="rounded border border-destructive/40 p-1 text-destructive disabled:opacity-40"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">מסלולים לפי נקודת איסוף</h2>
              <button
                type="button"
                disabled={!canEdit || !transportGuests.length}
                onClick={addPickupRoutes}
                className="rounded-full border border-border px-3 py-2 text-sm disabled:opacity-40"
              >
                צור מסלולים מנקודות איסוף
              </button>
            </div>
            {!plan.routes.length ? (
              <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                עדיין אין מסלולים בטיוטה. הוסיפו רכב וצרו מסלולים מנקודות האיסוף.
              </p>
            ) : (
              plan.routes.map((route) => {
                const vehicle = plan.vehicles.find((item) => item.id === route.vehicleId);
                const occupied = routeOccupancy(plan, transportGuests, route.id);
                const routeAssignments = plan.assignments.filter(
                  (item) => item.routeId === route.id,
                );
                const options = transportGuests.filter(
                  (guest) =>
                    normalizePickup(guest.pickupLocation)?.toLocaleLowerCase("he-IL") ===
                      normalizePickup(route.pickupLocation)?.toLocaleLowerCase("he-IL") &&
                    !plan.assignments.some((item) => item.guestId === guest.id),
                );
                const overflow = summary.overCapacity.find((item) => item.routeId === route.id);
                return (
                  <article key={route.id} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-semibold">{route.label}</h3>
                        <p className="text-xs text-muted-foreground">
                          נקודת איסוף: {route.pickupLocation}
                        </p>
                      </div>
                      <button
                        type="button"
                        aria-label={`מחק מסלול ${route.label}`}
                        disabled={!canEdit || routeAssignments.length > 0}
                        onClick={() =>
                          setPlan((current) => ({
                            ...current,
                            routes: current.routes.filter((item) => item.id !== route.id),
                          }))
                        }
                        className="rounded border border-destructive/40 p-1 text-destructive disabled:opacity-40"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-end gap-3">
                      <label className="min-w-[180px] flex-1 text-sm">
                        רכב
                        <select
                          value={route.vehicleId ?? ""}
                          disabled={!canEdit}
                          onChange={(event) => changeVehicle(route.id, event.target.value)}
                          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-40"
                        >
                          <option value="">בחרו רכב</option>
                          {plan.vehicles.map((item) => (
                            <option
                              key={item.id}
                              value={item.id}
                              disabled={plan.routes.some(
                                (other) => other.id !== route.id && other.vehicleId === item.id,
                              )}
                            >
                              {item.label} · {item.capacity} מקומות
                            </option>
                          ))}
                        </select>
                      </label>
                      <p className="text-sm">
                        {occupied} מתוך {vehicle?.capacity ?? "—"} מקומות
                      </p>
                    </div>
                    {overflow && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        חריגה של {overflow.excess} מקומות אחרי שינוי קיבולת. השיבוצים נשמרו לטיפול.
                      </p>
                    )}
                    {!route.vehicleId && routeAssignments.length > 0 && (
                      <p role="alert" className="mt-2 text-sm text-destructive">
                        למסלול יש שיבוצים אך אין רכב משויך.
                      </p>
                    )}
                    {canEdit && (
                      <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                        <label className="min-w-[170px] flex-1 text-sm">
                          קבוצת הזמנה
                          <select
                            value={selectedByRoute[route.id] ?? ""}
                            onChange={(event) =>
                              setSelectedByRoute((current) => ({
                                ...current,
                                [route.id]: event.target.value,
                              }))
                            }
                            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                          >
                            <option value="">בחרו קבוצה</option>
                            {options.map((guest) => (
                              <option key={guest.id} value={guest.id}>
                                {guest.name} · {guest.groupSize} אנשים
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          disabled={!selectedByRoute[route.id] || !route.vehicleId}
                          onClick={() => addGroup(route.id)}
                          className="rounded-lg bg-gold/20 px-3 py-2 text-sm ring-1 ring-gold/40 disabled:opacity-40"
                        >
                          שבצו להסעה
                        </button>
                      </div>
                    )}
                    {!routeAssignments.length ? (
                      <p className="mt-3 text-sm text-muted-foreground">
                        אין קבוצות משובצות למסלול.
                      </p>
                    ) : (
                      <ul className="mt-3 space-y-2">
                        {routeAssignments.map((assignment) => {
                          const guest = transportGuests.find(
                            (item) => item.id === assignment.guestId,
                          );
                          return (
                            <li
                              key={assignment.guestId}
                              className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary/50 p-2 text-sm"
                            >
                              <span>
                                {guest?.name ?? "קבוצה שכבר אינה ברשימה"} ·{" "}
                                {guest?.groupSize ?? "—"} אנשים
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPlan((current) => ({
                                      ...current,
                                      assignments: current.assignments.filter(
                                        (item) => item.guestId !== assignment.guestId,
                                      ),
                                    }))
                                  }
                                  className="rounded border border-border px-2 py-1"
                                >
                                  הסר שיבוץ
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </article>
                );
              })
            )}
          </section>
          <p className="mt-5 text-xs text-muted-foreground">
            הטיוטה אינה כוללת זמני נסיעה, פיצול קבוצות, מסלולי מפה או הזמנת ספק. בדקו פרטים אלה
            ידנית לפני תפעול יום האירוע.
          </p>
        </>
      )}
    </main>
  );
}
