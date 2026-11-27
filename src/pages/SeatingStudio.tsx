import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Lock,
  Plus,
  RotateCcw,
  RotateCw,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useGuests } from "@/hooks/useGuests";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  assessSeating,
  addSeatingAssignment,
  changeTableCapacity,
  type SeatingPlan,
  type SeatingTable,
} from "@/lib/seating-domain";

type History = { past: SeatingPlan[]; present: SeatingPlan; future: SeatingPlan[] };
type Viewport = { x: number; y: number; width: number; height: number };
type Drag =
  | {
      kind: "table";
      pointerId: number;
      tableId: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      currentX: number;
      currentY: number;
      view: Viewport;
    }
  | { kind: "pan"; pointerId: number; startX: number; startY: number; view: Viewport };

const INITIAL_VIEW: Viewport = { x: 0, y: 0, width: 1000, height: 650 };
const EMPTY_PLAN: SeatingPlan = { tables: [], assignments: [] };
const SHAPES: { value: SeatingTable["shape"]; label: string }[] = [
  { value: "round", label: "עגול" },
  { value: "square", label: "מרובע" },
  { value: "rectangle", label: "מלבני" },
];

export default function SeatingStudio() {
  const workspace = useWorkspace();
  const subscription = useSubscription(workspace.activeEventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("seating_view");
  const canEdit = canView && workspace.can("seating_edit") && subscription.canEdit;
  const canViewGuests = canView && workspace.can("guests_view");

  if (workspace.loading) return <PageState title="טוענים את סביבת העבודה" />;
  if (workspace.error) return <PageState title="לא הצלחנו לטעון את סביבת העבודה" />;
  if (!workspace.activeWorkspace) return <PageState title="אין סביבת עבודה פעילה" />;
  if (!canView) return <PageState title="אין לך הרשאה לצפייה בסקיצת האולם" />;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      <AppTopBar subscription={subscription} />
      <Studio
        key={workspace.activeEventId}
        eventName={workspace.activeWorkspace.event_name}
        eventId={workspace.activeWorkspace.event_id}
        canEdit={canEdit}
        canViewGuests={canViewGuests}
        permissionChecking={subscription.loading}
        permissionError={!!subscription.error}
      />
    </div>
  );
}

function PageState({ title }: { title: string }) {
  return (
    <div
      dir="rtl"
      className="flex min-h-screen items-center justify-center bg-background px-4 text-center text-foreground"
    >
      {title}
    </div>
  );
}

function Studio({
  eventName,
  eventId,
  canEdit,
  canViewGuests,
  permissionChecking,
  permissionError,
}: {
  eventName: string;
  eventId: string;
  canEdit: boolean;
  canViewGuests: boolean;
  permissionChecking: boolean;
  permissionError: boolean;
}) {
  const [history, setHistory] = useState<History>({ past: [], present: EMPTY_PLAN, future: [] });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const [previewPosition, setPreviewPosition] = useState<{
    tableId: string;
    x: number;
    y: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const guestSource = useGuests(canViewGuests ? eventId : null, true);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const plan = history.present;
  const selected = plan.tables.find((table) => table.id === selectedId) ?? null;
  const seated = useMemo(
    () =>
      new Map(
        plan.tables.map((table) => [
          table.id,
          plan.assignments
            .filter((item) => item.tableId === table.id)
            .reduce((sum, item) => sum + item.count, 0),
        ]),
      ),
    [plan],
  );
  const guestSizes = useMemo(
    () => guestSource.allGuests.map((guest) => ({ id: guest.id, groupSize: guest.group_size })),
    [guestSource.allGuests],
  );
  const warnings = assessSeating(plan, guestSizes);
  const assignedByGroup = useMemo(() => {
    const totals = new Map<string, number>();
    for (const assignment of plan.assignments)
      totals.set(assignment.guestId, (totals.get(assignment.guestId) ?? 0) + assignment.count);
    return totals;
  }, [plan.assignments]);
  const totalOccupied = plan.assignments.reduce((sum, item) => sum + item.count, 0);
  const selectedAssignments = selected
    ? plan.assignments.filter((item) => item.tableId === selected.id)
    : [];

  function commit(next: SeatingPlan) {
    if (!canEdit || next === history.present) return;
    setHistory((current) => ({
      past: [...current.past, current.present].slice(-50),
      present: next,
      future: [],
    }));
    setError(null);
  }

  function editSelected(patch: Partial<SeatingTable>) {
    if (!selected || selected.locked || !canEdit) return;
    commit({
      ...plan,
      tables: plan.tables.map((table) =>
        table.id === selected.id ? { ...table, ...patch } : table,
      ),
    });
  }

  function addTable(shape: SeatingTable["shape"]) {
    if (!canEdit) return;
    const id = crypto.randomUUID();
    const number = plan.tables.length + 1;
    const table: SeatingTable = {
      id,
      name: `שולחן ${number}`,
      shape,
      capacity: 10,
      x: viewport.x + viewport.width / 2,
      y: viewport.y + viewport.height / 2,
      rotation: 0,
      locked: false,
    };
    commit({ ...plan, tables: [...plan.tables, table] });
    setSelectedId(id);
  }

  function moveSelected(dx: number, dy: number) {
    if (!selected || selected.locked) return;
    editSelected({
      x: Math.max(0, Math.min(1000, selected.x + dx)),
      y: Math.max(0, Math.min(650, selected.y + dy)),
    });
  }

  function onPointerDownTable(event: React.PointerEvent<SVGGElement>, table: SeatingTable) {
    event.stopPropagation();
    setSelectedId(table.id);
    if (!canEdit || table.locked) return;
    dragRef.current = {
      kind: "table",
      pointerId: event.pointerId,
      tableId: table.id,
      startX: event.clientX,
      startY: event.clientY,
      x: table.x,
      y: table.y,
      currentX: table.x,
      currentY: table.y,
      view: viewport,
    };
    svgRef.current?.setPointerCapture(event.pointerId);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;
    const dx = ((event.clientX - drag.startX) / rect.width) * drag.view.width;
    const dy = ((event.clientY - drag.startY) / rect.height) * drag.view.height;
    if (drag.kind === "pan")
      setViewport({ ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy });
    else {
      drag.currentX = Math.max(0, Math.min(1000, drag.x + dx));
      drag.currentY = Math.max(0, Math.min(650, drag.y + dy));
      setPreviewPosition({ tableId: drag.tableId, x: drag.currentX, y: drag.currentY });
    }
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "table") {
      const table = plan.tables.find((item) => item.id === drag.tableId);
      if (table && (table.x !== drag.currentX || table.y !== drag.currentY)) {
        commit({
          ...plan,
          tables: plan.tables.map((item) =>
            item.id === drag.tableId ? { ...item, x: drag.currentX, y: drag.currentY } : item,
          ),
        });
      }
    }
    dragRef.current = null;
    setPreviewPosition(null);
    if (svgRef.current?.hasPointerCapture(event.pointerId))
      svgRef.current.releasePointerCapture(event.pointerId);
  }

  function zoom(factor: number) {
    setViewport((current) => {
      const width = Math.max(250, Math.min(1600, current.width * factor));
      const height = width * 0.65;
      return {
        x: current.x + (current.width - width) / 2,
        y: current.y + (current.height - height) / 2,
        width,
        height,
      };
    });
  }

  function assignGuest() {
    if (
      !canEdit ||
      !canViewGuests ||
      !selected ||
      selected.locked ||
      guestSource.loading ||
      guestSource.error
    )
      return;
    const guest = guestSource.allGuests.find((item) => item.id === selectedGuestId);
    if (!guest) {
      setError("בחרו קבוצת הזמנה לשיבוץ");
      return;
    }
    try {
      const next = addSeatingAssignment(plan, guestSizes, {
        id: crypto.randomUUID(),
        tableId: selected.id,
        guestId: guest.id,
        memberId: null,
        count: guestCount,
        seatNumber: null,
      });
      commit(next);
      setGuestCount(1);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "השיבוץ נכשל");
    }
  }

  function moveAssignment(assignmentId: string, tableId: string) {
    if (!canEdit || !canViewGuests || guestSource.loading || guestSource.error) return;
    const assignment = plan.assignments.find((item) => item.id === assignmentId);
    if (!assignment || assignment.tableId === tableId) return;
    const source = plan.tables.find((item) => item.id === assignment.tableId);
    if (source?.locked) {
      setError("השולחן נעול לעריכה");
      return;
    }
    try {
      const without = {
        ...plan,
        assignments: plan.assignments.filter((item) => item.id !== assignmentId),
      };
      commit(
        addSeatingAssignment(without, guestSizes, { ...assignment, tableId, seatNumber: null }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "העברת השיבוץ נכשלה");
    }
  }

  function removeAssignment(assignmentId: string) {
    if (!canEdit || !canViewGuests || !selected || selected.locked) return;
    commit({ ...plan, assignments: plan.assignments.filter((item) => item.id !== assignmentId) });
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{eventName}</p>
          <h1 className="font-display text-3xl">סקיצת האולם</h1>
        </div>
        <Link
          to="/guests"
          className="rounded-full border border-border px-4 py-2 text-sm hover:bg-secondary"
        >
          חזרה למוזמנים
        </Link>
      </div>
      <div role="status" className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
        זו טיוטה מקומית בלבד. הסקיצה והשיבוצים אינם נשמרים בענן ויימחקו כשתעזבו את העמוד. שמירה
        קבועה ועבודה משותפת יחוברו לאחר השלמת מסד הנתונים.
      </div>
      {!canEdit && (
        <p role="status" className="mb-4 rounded-xl bg-secondary p-3 text-sm">
          {permissionChecking
            ? "בודקים הרשאות עריכה..."
            : permissionError
              ? "לא הצלחנו לבדוק את מצב המנוי. העריכה חסומה עד לטעינה תקינה."
              : "סביבת העבודה במצב צפייה בלבד."}
        </p>
      )}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {SHAPES.map((shape) => (
          <button
            key={shape.value}
            type="button"
            disabled={!canEdit}
            onClick={() => addTable(shape.value)}
            className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-3 py-2 text-sm ring-1 ring-gold/40 disabled:opacity-40"
          >
            <Plus size={15} /> שולחן {shape.label}
          </button>
        ))}
        <button
          type="button"
          disabled={!canEdit || !history.past.length}
          onClick={() =>
            setHistory((current) => ({
              past: current.past.slice(0, -1),
              present: current.past.at(-1) ?? current.present,
              future: [current.present, ...current.future],
            }))
          }
          className="rounded-full border border-border p-2 disabled:opacity-40"
          aria-label="בטל פעולה"
        >
          <RotateCcw size={17} />
        </button>
        <button
          type="button"
          disabled={!canEdit || !history.future.length}
          onClick={() =>
            setHistory((current) => ({
              past: [...current.past, current.present],
              present: current.future[0] ?? current.present,
              future: current.future.slice(1),
            }))
          }
          className="rounded-full border border-border p-2 disabled:opacity-40"
          aria-label="בצע שוב"
        >
          <RotateCw size={17} />
        </button>
        <button
          type="button"
          onClick={() => zoom(0.8)}
          className="rounded-full border border-border p-2"
          aria-label="התקרב"
        >
          <ZoomIn size={17} />
        </button>
        <button
          type="button"
          onClick={() => zoom(1.25)}
          className="rounded-full border border-border p-2"
          aria-label="התרחק"
        >
          <ZoomOut size={17} />
        </button>
        <button
          type="button"
          onClick={() => setViewport(INITIAL_VIEW)}
          className="rounded-full border border-border px-3 py-2 text-sm"
        >
          התאם למסך
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <svg
            ref={svgRef}
            role="img"
            aria-label="סקיצת אולם. בחרו שולחן לעריכה או גררו לשינוי מיקום."
            viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
            onPointerDown={(event) => {
              dragRef.current = {
                kind: "pan",
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                view: viewport,
              };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            className="aspect-[1000/650] w-full touch-none select-none"
            style={{
              backgroundImage:
                "linear-gradient(#dde4e7 1px, transparent 1px), linear-gradient(90deg, #dde4e7 1px, transparent 1px)",
              backgroundSize: "30px 30px",
            }}
          >
            <rect
              x="0"
              y="0"
              width="1000"
              height="650"
              fill="transparent"
              stroke="currentColor"
              strokeWidth="3"
            />
            {plan.tables.map((table) => {
              const position = previewPosition?.tableId === table.id ? previewPosition : table;
              const active = selectedId === table.id;
              return (
                <g
                  key={table.id}
                  transform={`translate(${position.x} ${position.y}) rotate(${table.rotation})`}
                  onPointerDown={(event) => onPointerDownTable(event, table)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedId(table.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${table.name}, ${seated.get(table.id) ?? 0} מתוך ${table.capacity} מקומות`}
                  className="cursor-pointer outline-none"
                >
                  {table.shape === "round" ? (
                    <circle
                      r="48"
                      fill={active ? "#f6dba7" : "#fff7e7"}
                      stroke={active ? "#ab6b20" : "#9f8c75"}
                      strokeWidth="3"
                    />
                  ) : (
                    <rect
                      x={table.shape === "rectangle" ? -65 : -48}
                      y="-42"
                      width={table.shape === "rectangle" ? 130 : 96}
                      height="84"
                      rx="12"
                      fill={active ? "#f6dba7" : "#fff7e7"}
                      stroke={active ? "#ab6b20" : "#9f8c75"}
                      strokeWidth="3"
                    />
                  )}
                  <text
                    y="-5"
                    textAnchor="middle"
                    fontSize="16"
                    fill="#432f20"
                    transform={`rotate(${-table.rotation})`}
                  >
                    {table.name}
                  </text>
                  <text
                    y="18"
                    textAnchor="middle"
                    fontSize="13"
                    fill="#594537"
                    transform={`rotate(${-table.rotation})`}
                  >
                    {seated.get(table.id) ?? 0}/{table.capacity}
                  </text>
                  {table.locked && (
                    <text y="40" textAnchor="middle" fontSize="13" fill="#594537">
                      נעול
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {!plan.tables.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              הוסיפו שולחן כדי להתחיל לבנות את הסקיצה.
            </p>
          )}
        </div>
        <aside className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">{selected ? selected.name : "פרטי שולחן"}</h2>
          {!selected ? (
            <p className="text-sm text-muted-foreground">
              בחרו שולחן בסקיצה. במגע אפשר לגרור; במקלדת בחרו עם Enter ושנו מיקום עם החצים כאן.
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <label className="block">
                שם השולחן
                <input
                  value={selected.name}
                  disabled={!canEdit || selected.locked}
                  onChange={(event) => editSelected({ name: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                קיבולת
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={selected.capacity}
                  disabled={!canEdit || selected.locked}
                  onChange={(event) => {
                    try {
                      commit(changeTableCapacity(plan, selected.id, Number(event.target.value)));
                    } catch (reason) {
                      setError(reason instanceof Error ? reason.message : "קיבולת לא תקינה");
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="block">
                זווית סיבוב
                <input
                  type="range"
                  min="0"
                  max="350"
                  step="10"
                  value={selected.rotation}
                  disabled={!canEdit || selected.locked}
                  onChange={(event) => editSelected({ rotation: Number(event.target.value) })}
                  className="mt-1 w-full"
                />
                {selected.rotation}°
              </label>
              <div>
                <p className="mb-1">מיקום</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    disabled={!canEdit || selected.locked}
                    onClick={() => moveSelected(0, -10)}
                    aria-label="הזז למעלה"
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    disabled={!canEdit || selected.locked}
                    onClick={() => moveSelected(0, 10)}
                    aria-label="הזז למטה"
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    disabled={!canEdit || selected.locked}
                    onClick={() => moveSelected(-10, 0)}
                    aria-label="הזז שמאלה"
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    disabled={!canEdit || selected.locked}
                    onClick={() => moveSelected(10, 0)}
                    aria-label="הזז ימינה"
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              <p>
                תפוסה: {seated.get(selected.id) ?? 0} מתוך {selected.capacity}. פנויים:{" "}
                {Math.max(0, selected.capacity - (seated.get(selected.id) ?? 0))}.
              </p>
              <div className="space-y-2 border-t border-border pt-3">
                <h3 className="font-semibold">שיבוץ קבוצות הזמנה</h3>
                {!canViewGuests ? (
                  <p className="text-muted-foreground">
                    אין הרשאת צפייה במוזמנים; שיבוץ אינו זמין.
                  </p>
                ) : guestSource.loading ? (
                  <p className="text-muted-foreground">טוענים מוזמנים...</p>
                ) : guestSource.error ? (
                  <div role="alert">
                    <p>{guestSource.error}</p>
                    <button
                      type="button"
                      onClick={() => void guestSource.reload()}
                      className="underline"
                    >
                      נסו שוב
                    </button>
                  </div>
                ) : guestSource.allGuests.length === 0 ? (
                  <p className="text-muted-foreground">אין קבוצות הזמנה לשיבוץ.</p>
                ) : (
                  <>
                    {canEdit && !selected.locked && (
                      <div className="space-y-2">
                        <label className="block">
                          קבוצת הזמנה
                          <select
                            value={selectedGuestId}
                            onChange={(event) => setSelectedGuestId(event.target.value)}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2"
                          >
                            <option value="">בחרו קבוצה</option>
                            {guestSource.allGuests.map((guest) => {
                              const free = Math.max(
                                0,
                                guest.group_size - (assignedByGroup.get(guest.id) ?? 0),
                              );
                              return (
                                <option key={guest.id} value={guest.id} disabled={free === 0}>
                                  {guest.full_name} · {free} טרם שובצו
                                </option>
                              );
                            })}
                          </select>
                        </label>
                        <label className="block">
                          מספר אנשים מהקבוצה
                          <input
                            type="number"
                            min="1"
                            max={Math.max(
                              1,
                              guestSource.allGuests.find((guest) => guest.id === selectedGuestId)
                                ?.group_size ?? 1,
                            )}
                            value={guestCount}
                            onChange={(event) => setGuestCount(Number(event.target.value))}
                            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={assignGuest}
                          disabled={!selectedGuestId}
                          className="rounded-lg bg-gold/20 px-3 py-2 font-semibold ring-1 ring-gold/40 disabled:opacity-40"
                        >
                          שבצו לשולחן
                        </button>
                      </div>
                    )}
                    <ul className="space-y-2" aria-label="שיבוצים לשולחן">
                      {selectedAssignments.map((assignment) => {
                        const guest = guestSource.allGuests.find(
                          (item) => item.id === assignment.guestId,
                        );
                        return (
                          <li key={assignment.id} className="rounded-lg bg-secondary/60 p-2">
                            <p>
                              {guest?.full_name ?? "קבוצה שכבר אינה ברשימה"} · {assignment.count}{" "}
                              מקומות
                            </p>
                            {canEdit && !selected.locked && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                <select
                                  aria-label={`העבר את ${guest?.full_name ?? "הקבוצה"} לשולחן`}
                                  value={selected.id}
                                  onChange={(event) =>
                                    moveAssignment(assignment.id, event.target.value)
                                  }
                                  className="min-w-0 rounded border border-border bg-background px-2 py-1"
                                >
                                  {plan.tables.map((table) => (
                                    <option key={table.id} value={table.id} disabled={table.locked}>
                                      {table.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  onClick={() => removeAssignment(assignment.id)}
                                  className="rounded border border-destructive/40 px-2 py-1 text-destructive"
                                >
                                  הסר שיבוץ
                                </button>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                    {!selectedAssignments.length && (
                      <p className="text-muted-foreground">עדיין אין שיבוצים בשולחן.</p>
                    )}
                  </>
                )}
              </div>
              {warnings.some(
                (warning) => warning.kind === "over_capacity" && warning.tableId === selected.id,
              ) && (
                <p role="alert" className="text-destructive">
                  השולחן חורג מהקיבולת. השיבוצים נשמרו לטיפול.
                </p>
              )}
              {warnings.some((warning) => warning.kind === "group_over_assigned") && (
                <p role="alert" className="text-destructive">
                  מספר המשובצים בקבוצה אחת או יותר חורג מגודל הקבוצה המעודכן. השיבוצים נשמרו לבדיקה.
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    commit({
                      ...plan,
                      tables: plan.tables.map((table) =>
                        table.id === selected.id ? { ...table, locked: !table.locked } : table,
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 disabled:opacity-40"
                >
                  {selected.locked ? <Unlock size={14} /> : <Lock size={14} />}
                  {selected.locked ? "פתח" : "נעל"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...plan,
                      tables: [
                        ...plan.tables,
                        {
                          ...selected,
                          id,
                          name: `${selected.name} עותק`,
                          x: Math.min(1000, selected.x + 30),
                          y: Math.min(650, selected.y + 30),
                          locked: false,
                        },
                      ],
                    });
                    setSelectedId(id);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 disabled:opacity-40"
                >
                  <Copy size={14} /> שכפל
                </button>
                <button
                  type="button"
                  disabled={!canEdit || selected.locked || selectedAssignments.length > 0}
                  onClick={() => {
                    commit({
                      ...plan,
                      tables: plan.tables.filter((table) => table.id !== selected.id),
                    });
                    setSelectedId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-1.5 text-destructive disabled:opacity-40"
                >
                  <Trash2 size={14} /> מחק
                </button>
              </div>
              {selectedAssignments.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  כדי למחוק שולחן, הסירו קודם את השיבוצים שלו.
                </p>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          )}
        </aside>
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        {plan.tables.length} שולחנות · {plan.tables.reduce((sum, table) => sum + table.capacity, 0)}{" "}
        מקומות ישיבה · {totalOccupied} משובצים ·{" "}
        {Math.max(0, guestSizes.reduce((sum, guest) => sum + guest.groupSize, 0) - totalOccupied)}{" "}
        טרם שובצו · הסקיצה אינה תוכנית הנדסית מאושרת של האולם.
      </p>
    </main>
  );
}
