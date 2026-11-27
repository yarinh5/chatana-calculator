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
  Printer,
  RotateCcw,
  RotateCw,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { AppTopBar } from "@/components/AppTopBar";
import { useGuests } from "@/hooks/useGuests";
import { useGuestMembers } from "@/hooks/useGuestMembers";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  assessSeating,
  addSeatingAssignment,
  changeTableCapacity,
  type HallObject,
  type SeatingPlan,
  type SeatingTable,
} from "@/lib/seating-domain";

type History = { past: SeatingPlan[]; present: SeatingPlan; future: SeatingPlan[] };
type LayoutDraft = { id: string; name: string; history: History };
type LayoutState = { drafts: LayoutDraft[]; selectedId: string; activeId: string };
type Viewport = { x: number; y: number; width: number; height: number };
type Drag =
  | {
      kind: "table" | "object";
      pointerId: number;
      targetId: string;
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
const EMPTY_PLAN: SeatingPlan = { tables: [], objects: [], assignments: [] };
const SHAPES: { value: SeatingTable["shape"]; label: string }[] = [
  { value: "round", label: "עגול" },
  { value: "square", label: "מרובע" },
  { value: "rectangle", label: "מלבני" },
];
const OBJECT_KINDS: { value: HallObject["kind"]; label: string }[] = [
  { value: "dance_floor", label: "רחבת ריקודים" },
  { value: "canopy", label: "חופה" },
  { value: "stage", label: "במה" },
  { value: "dj", label: "DJ" },
  { value: "bar", label: "בר" },
  { value: "entrance", label: "כניסה" },
  { value: "exit", label: "יציאה" },
  { value: "reception", label: "קבלת פנים" },
  { value: "gift_station", label: "עמדת מתנות" },
  { value: "buffet", label: "בופה" },
  { value: "wall", label: "מחיצה" },
  { value: "custom", label: "טקסט חופשי" },
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
  const [layoutState, setLayoutState] = useState<LayoutState>(() => ({
    drafts: [
      { id: "first", name: "סקיצה ראשית", history: { past: [], present: EMPTY_PLAN, future: [] } },
    ],
    selectedId: "first",
    activeId: "first",
  }));
  const currentDraft = layoutState.drafts.find((draft) => draft.id === layoutState.selectedId)!;
  const history = currentDraft.history;
  const setHistory = (update: History | ((current: History) => History)) => {
    setLayoutState((current) => ({
      ...current,
      drafts: current.drafts.map((draft) =>
        draft.id === current.selectedId
          ? { ...draft, history: typeof update === "function" ? update(draft.history) : update }
          : draft,
      ),
    }));
  };
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [newObjectKind, setNewObjectKind] = useState<HallObject["kind"]>("dance_floor");
  const [viewport, setViewport] = useState<Viewport>(INITIAL_VIEW);
  const [previewPosition, setPreviewPosition] = useState<{
    targetId: string;
    x: number;
    y: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGuestId, setSelectedGuestId] = useState("");
  const [guestCount, setGuestCount] = useState(1);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedSeatNumber, setSelectedSeatNumber] = useState("");
  const guestSource = useGuests(canViewGuests ? eventId : null, true);
  const memberSource = useGuestMembers(canViewGuests ? eventId : null);
  const dragRef = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const plan = history.present;
  const selected = plan.tables.find((table) => table.id === selectedId) ?? null;
  const selectedObject = plan.objects.find((object) => object.id === selectedObjectId) ?? null;
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
    () =>
      guestSource.allGuests.map((guest) => ({
        id: guest.id,
        groupSize: guest.group_size,
        memberIds:
          !memberSource.loading && !memberSource.error
            ? (memberSource.membersByGuest[guest.id] ?? []).map((member) => member.id)
            : undefined,
      })),
    [guestSource.allGuests, memberSource.loading, memberSource.error, memberSource.membersByGuest],
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
  const guestNames = useMemo(
    () => Object.fromEntries(guestSource.allGuests.map((guest) => [guest.id, guest.full_name])),
    [guestSource.allGuests],
  );
  const memberNames = useMemo(
    () =>
      Object.fromEntries(
        memberSource.members.map((member) => [member.id, member.full_name?.trim() ?? ""]),
      ),
    [memberSource.members],
  );
  const printUnavailable =
    plan.assignments.length > 0 &&
    (!canViewGuests ||
      guestSource.loading ||
      !!guestSource.error ||
      plan.assignments.some((assignment) => !guestNames[assignment.guestId]) ||
      (plan.assignments.some((assignment) => !!assignment.memberId) &&
        (memberSource.loading ||
          !!memberSource.error ||
          plan.assignments.some(
            (assignment) => assignment.memberId && !memberNames[assignment.memberId],
          ))));

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
    setSelectedObjectId(null);
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
    setSelectedObjectId(null);
    if (!canEdit || table.locked) return;
    dragRef.current = {
      kind: "table",
      pointerId: event.pointerId,
      targetId: table.id,
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

  function onPointerDownObject(event: React.PointerEvent<SVGGElement>, object: HallObject) {
    event.stopPropagation();
    setSelectedObjectId(object.id);
    setSelectedId(null);
    if (!canEdit || object.locked) return;
    dragRef.current = {
      kind: "object",
      pointerId: event.pointerId,
      targetId: object.id,
      startX: event.clientX,
      startY: event.clientY,
      x: object.x,
      y: object.y,
      currentX: object.x,
      currentY: object.y,
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
      setPreviewPosition({ targetId: drag.targetId, x: drag.currentX, y: drag.currentY });
    }
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.kind === "table") {
      const table = plan.tables.find((item) => item.id === drag.targetId);
      if (table && (table.x !== drag.currentX || table.y !== drag.currentY)) {
        commit({
          ...plan,
          tables: plan.tables.map((item) =>
            item.id === drag.targetId ? { ...item, x: drag.currentX, y: drag.currentY } : item,
          ),
        });
      }
    } else if (drag.kind === "object") {
      const object = plan.objects.find((item) => item.id === drag.targetId);
      if (object && (object.x !== drag.currentX || object.y !== drag.currentY)) {
        commit({
          ...plan,
          objects: plan.objects.map((item) =>
            item.id === drag.targetId ? { ...item, x: drag.currentX, y: drag.currentY } : item,
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

  function addObject(kind: HallObject["kind"]) {
    if (!canEdit) return;
    const id = crypto.randomUUID();
    const label = OBJECT_KINDS.find((item) => item.value === kind)?.label ?? "אובייקט";
    const object: HallObject = {
      id,
      kind,
      label,
      x: Math.max(0, viewport.x + viewport.width / 2 - 55),
      y: Math.max(0, viewport.y + viewport.height / 2 - 35),
      width: 110,
      height: 70,
      rotation: 0,
      locked: false,
    };
    commit({ ...plan, objects: [...plan.objects, object] });
    setSelectedObjectId(id);
    setSelectedId(null);
  }

  function editObject(patch: Partial<HallObject>) {
    if (!selectedObject || selectedObject.locked || !canEdit) return;
    if (
      (patch.width !== undefined && (!Number.isFinite(patch.width) || patch.width <= 0)) ||
      (patch.height !== undefined && (!Number.isFinite(patch.height) || patch.height <= 0)) ||
      (patch.x !== undefined && !Number.isFinite(patch.x)) ||
      (patch.y !== undefined && !Number.isFinite(patch.y))
    ) {
      setError("יש להזין מיקום ומידות תקינים");
      return;
    }
    commit({
      ...plan,
      objects: plan.objects.map((item) =>
        item.id === selectedObject.id ? { ...item, ...patch } : item,
      ),
    });
  }

  function createLayout(copyCurrent: boolean) {
    if (!canEdit) return;
    const id = crypto.randomUUID();
    const number = layoutState.drafts.length + 1;
    const source: SeatingPlan = copyCurrent ? plan : { tables: [], objects: [], assignments: [] };
    setLayoutState((current) => ({
      ...current,
      drafts: [
        ...current.drafts,
        {
          id,
          name: copyCurrent ? `${currentDraft.name} עותק` : `סקיצה ${number}`,
          history: { past: [], present: source, future: [] },
        },
      ],
      selectedId: id,
    }));
    setSelectedId(null);
    setSelectedObjectId(null);
    setViewport(INITIAL_VIEW);
  }

  function selectLayout(id: string) {
    if (!layoutState.drafts.some((draft) => draft.id === id)) return;
    setLayoutState((current) => ({ ...current, selectedId: id }));
    setSelectedId(null);
    setSelectedObjectId(null);
    setViewport(INITIAL_VIEW);
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

  function assignNamedMember() {
    if (
      !canEdit ||
      !canViewGuests ||
      !selected ||
      selected.locked ||
      guestSource.loading ||
      guestSource.error ||
      memberSource.loading ||
      memberSource.error
    )
      return;
    const member = memberSource.members.find((item) => item.id === selectedMemberId);
    if (!member || !guestSource.allGuests.some((guest) => guest.id === member.guest_id)) {
      setError("בחרו משתתף מקבוצת הזמנה קיימת");
      return;
    }
    try {
      const next = addSeatingAssignment(plan, guestSizes, {
        id: crypto.randomUUID(),
        tableId: selected.id,
        guestId: member.guest_id,
        memberId: member.id,
        count: 1,
        seatNumber: selectedSeatNumber ? Number(selectedSeatNumber) : null,
      });
      commit(next);
      setSelectedMemberId("");
      setSelectedSeatNumber("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "שיבוץ המשתתף נכשל");
    }
  }

  function changeSeat(assignmentId: string, seat: string) {
    if (!canEdit || !selected || selected.locked || memberSource.loading || memberSource.error)
      return;
    const assignment = plan.assignments.find((item) => item.id === assignmentId);
    if (!assignment?.memberId) return;
    try {
      const without = {
        ...plan,
        assignments: plan.assignments.filter((item) => item.id !== assignmentId),
      };
      commit(
        addSeatingAssignment(without, guestSizes, {
          ...assignment,
          seatNumber: seat ? Number(seat) : null,
        }),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "בחירת המושב נכשלה");
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
    <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 print:max-w-none print:p-0">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 print:hidden">
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
      <div
        role="status"
        className="mb-5 rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm print:hidden"
      >
        זו טיוטה מקומית בלבד. הסקיצה והשיבוצים אינם נשמרים בענן ויימחקו כשתעזבו את העמוד. שמירה
        קבועה ועבודה משותפת יחוברו לאחר השלמת מסד הנתונים.
      </div>
      {!canEdit && (
        <p role="status" className="mb-4 rounded-xl bg-secondary p-3 text-sm print:hidden">
          {permissionChecking
            ? "בודקים הרשאות עריכה..."
            : permissionError
              ? "לא הצלחנו לבדוק את מצב המנוי. העריכה חסומה עד לטעינה תקינה."
              : "סביבת העבודה במצב צפייה בלבד."}
        </p>
      )}
      <section
        aria-label="חלופות סקיצה"
        className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl border border-border bg-card p-3 print:hidden"
      >
        <label className="min-w-[160px] flex-1 text-sm">
          חלופה
          <select
            value={layoutState.selectedId}
            onChange={(event) => selectLayout(event.target.value)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            {layoutState.drafts.map((draft) => (
              <option key={draft.id} value={draft.id}>
                {draft.name}
                {draft.id === layoutState.activeId ? " · פעילה" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="min-w-[160px] flex-1 text-sm">
          שם הסקיצה
          <input
            value={currentDraft.name}
            disabled={!canEdit}
            onChange={(event) =>
              setLayoutState((current) => ({
                ...current,
                drafts: current.drafts.map((draft) =>
                  draft.id === current.selectedId ? { ...draft, name: event.target.value } : draft,
                ),
              }))
            }
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
          />
        </label>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => createLayout(false)}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
        >
          סקיצה חדשה
        </button>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => createLayout(true)}
          className="rounded-lg border border-border px-3 py-2 text-sm disabled:opacity-40"
        >
          שכפל חלופה
        </button>
        <button
          type="button"
          disabled={!canEdit || layoutState.activeId === layoutState.selectedId}
          onClick={() =>
            setLayoutState((current) => ({ ...current, activeId: current.selectedId }))
          }
          className="rounded-lg border border-gold/50 bg-gold/10 px-3 py-2 text-sm disabled:opacity-40"
        >
          סמן כפעילה
        </button>
        <button
          type="button"
          disabled={!canEdit || layoutState.drafts.length <= 1}
          onClick={() => {
            if (
              !window.confirm("למחוק את החלופה המקומית הזאת? אי אפשר לשחזר אותה אחרי עזיבת העמוד.")
            )
              return;
            setLayoutState((current) => {
              const drafts = current.drafts.filter((draft) => draft.id !== current.selectedId);
              const nextId = drafts[0].id;
              return {
                drafts,
                selectedId: nextId,
                activeId: current.activeId === current.selectedId ? nextId : current.activeId,
              };
            });
            setSelectedId(null);
            setSelectedObjectId(null);
          }}
          className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive disabled:opacity-40"
        >
          מחק חלופה
        </button>
      </section>
      <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          disabled={printUnavailable}
          title={printUnavailable ? "לא ניתן להדפיס לפני שנתוני השיבוצים והשמות נטענו" : undefined}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Printer size={15} /> הדפסה / שמירה כ־PDF בדפדפן
        </button>
        {printUnavailable && (
          <span role="status" className="text-sm text-destructive">
            נתוני המוזמנים בשיבוצים חסרים. טענו אותם מחדש לפני יצוא PDF.
          </span>
        )}
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
        <select
          aria-label="סוג אובייקט באולם"
          value={newObjectKind}
          onChange={(event) => setNewObjectKind(event.target.value as HallObject["kind"])}
          className="rounded-lg border border-border bg-card px-2 py-2 text-sm"
        >
          {OBJECT_KINDS.map((kind) => (
            <option key={kind.value} value={kind.value}>
              {kind.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!canEdit}
          onClick={() => addObject(newObjectKind)}
          className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-2 text-sm disabled:opacity-40"
        >
          <Plus size={15} /> הוסף אובייקט
        </button>
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
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] print:hidden">
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
            {plan.objects.map((object) => {
              const position = previewPosition?.targetId === object.id ? previewPosition : object;
              const active = selectedObjectId === object.id;
              return (
                <g
                  key={object.id}
                  transform={`translate(${position.x} ${position.y}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})`}
                  onPointerDown={(event) => onPointerDownObject(event, object)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelectedObjectId(object.id);
                      setSelectedId(null);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${object.label}, אובייקט באולם`}
                  className="cursor-pointer outline-none"
                >
                  <rect
                    width={object.width}
                    height={object.height}
                    rx={object.kind === "dance_floor" ? 4 : 10}
                    fill={active ? "#b7d5d4" : "#dcebea"}
                    stroke={active ? "#226c69" : "#6b9a98"}
                    strokeWidth="3"
                  />
                  <text
                    x={object.width / 2}
                    y={object.height / 2}
                    dominantBaseline="middle"
                    textAnchor="middle"
                    fontSize="15"
                    fill="#194d4b"
                    transform={`rotate(${-object.rotation} ${object.width / 2} ${object.height / 2})`}
                  >
                    {object.label}
                  </text>
                </g>
              );
            })}
            {plan.tables.map((table) => {
              const position = previewPosition?.targetId === table.id ? previewPosition : table;
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
          {!plan.tables.length && !plan.objects.length && (
            <p className="p-4 text-center text-sm text-muted-foreground">
              הוסיפו שולחן או אובייקט כדי להתחיל לבנות את הסקיצה.
            </p>
          )}
        </div>
        <aside className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">
            {selectedObject?.label ?? selected?.name ?? "פרטי הסקיצה"}
          </h2>
          {selectedObject ? (
            <div className="space-y-3 text-sm">
              <label className="block">
                שם האובייקט
                <input
                  value={selectedObject.label}
                  disabled={!canEdit || selectedObject.locked}
                  onChange={(event) => editObject({ label: event.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
                />
              </label>
              <label className="block">
                רוחב
                <input
                  type="number"
                  min="1"
                  value={selectedObject.width}
                  disabled={!canEdit || selectedObject.locked}
                  onChange={(event) => editObject({ width: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
                />
              </label>
              <label className="block">
                גובה
                <input
                  type="number"
                  min="1"
                  value={selectedObject.height}
                  disabled={!canEdit || selectedObject.locked}
                  onChange={(event) => editObject({ height: Number(event.target.value) })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 disabled:opacity-50"
                />
              </label>
              <label className="block">
                זווית סיבוב
                <input
                  type="range"
                  min="0"
                  max="350"
                  step="10"
                  value={selectedObject.rotation}
                  disabled={!canEdit || selectedObject.locked}
                  onChange={(event) => editObject({ rotation: Number(event.target.value) })}
                  className="mt-1 w-full disabled:opacity-50"
                />
                {selectedObject.rotation}°
              </label>
              <div>
                <p className="mb-1">מיקום</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    aria-label="הזז אובייקט למעלה"
                    disabled={!canEdit || selectedObject.locked}
                    onClick={() => editObject({ y: selectedObject.y - 10 })}
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowUp size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="הזז אובייקט למטה"
                    disabled={!canEdit || selectedObject.locked}
                    onClick={() => editObject({ y: selectedObject.y + 10 })}
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowDown size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="הזז אובייקט שמאלה"
                    disabled={!canEdit || selectedObject.locked}
                    onClick={() => editObject({ x: selectedObject.x - 10 })}
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <button
                    type="button"
                    aria-label="הזז אובייקט ימינה"
                    disabled={!canEdit || selectedObject.locked}
                    onClick={() => editObject({ x: selectedObject.x + 10 })}
                    className="rounded border border-border p-2 disabled:opacity-40"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              </div>
              {warnings.some(
                (warning) =>
                  warning.kind === "object_out_of_bounds" && warning.objectId === selectedObject.id,
              ) && (
                <p role="alert" className="text-destructive">
                  האובייקט חורג מגבולות הסקיצה. שנו מיקום או מידות.
                </p>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() =>
                    commit({
                      ...plan,
                      objects: plan.objects.map((object) =>
                        object.id === selectedObject.id
                          ? { ...object, locked: !object.locked }
                          : object,
                      ),
                    })
                  }
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 disabled:opacity-40"
                >
                  {selectedObject.locked ? <Unlock size={14} /> : <Lock size={14} />}
                  {selectedObject.locked ? "פתח" : "נעל"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    commit({
                      ...plan,
                      objects: [
                        ...plan.objects,
                        {
                          ...selectedObject,
                          id,
                          label: `${selectedObject.label} עותק`,
                          x: selectedObject.x + 30,
                          y: selectedObject.y + 30,
                          locked: false,
                        },
                      ],
                    });
                    setSelectedObjectId(id);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-border px-2 py-1.5 disabled:opacity-40"
                >
                  <Copy size={14} /> שכפל
                </button>
                <button
                  type="button"
                  disabled={!canEdit || selectedObject.locked}
                  onClick={() => {
                    commit({
                      ...plan,
                      objects: plan.objects.filter((object) => object.id !== selectedObject.id),
                    });
                    setSelectedObjectId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded border border-destructive/40 px-2 py-1.5 text-destructive disabled:opacity-40"
                >
                  <Trash2 size={14} /> מחק
                </button>
              </div>
            </div>
          ) : !selected ? (
            <p className="text-sm text-muted-foreground">
              בחרו שולחן או אובייקט בסקיצה. במגע אפשר לגרור; במקלדת בחרו עם Enter ושנו מיקום עם
              החצים כאן.
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
                    {memberSource.loading ? (
                      <p className="text-muted-foreground">טוענים פירוט אישי לשיבוץ למושב...</p>
                    ) : memberSource.error ? (
                      <div role="alert" className="text-destructive">
                        <p>פירוט המשתתפים לא נטען; שיבוץ אישי למושב אינו זמין כרגע.</p>
                        <button
                          type="button"
                          onClick={() => void memberSource.refresh()}
                          className="underline"
                        >
                          נסו שוב
                        </button>
                      </div>
                    ) : (
                      canEdit &&
                      !selected.locked && (
                        <div className="space-y-2 border-t border-border pt-3">
                          <h4 className="font-semibold">שיבוץ משתתף אישי</h4>
                          <label className="block">
                            משתתף
                            <select
                              value={selectedMemberId}
                              onChange={(event) => setSelectedMemberId(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2"
                            >
                              <option value="">בחרו משתתף</option>
                              {memberSource.members
                                .filter((member) => {
                                  const guest = guestSource.allGuests.find(
                                    (item) => item.id === member.guest_id,
                                  );
                                  return (
                                    guest &&
                                    !plan.assignments.some(
                                      (assignment) => assignment.memberId === member.id,
                                    ) &&
                                    (assignedByGroup.get(guest.id) ?? 0) < guest.group_size
                                  );
                                })
                                .map((member) => (
                                  <option key={member.id} value={member.id}>
                                    {member.full_name?.trim() || "משתתף ללא שם"} ·{" "}
                                    {
                                      guestSource.allGuests.find(
                                        (guest) => guest.id === member.guest_id,
                                      )?.full_name
                                    }
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="block">
                            מושב מסוים (לא חובה)
                            <select
                              value={selectedSeatNumber}
                              onChange={(event) => setSelectedSeatNumber(event.target.value)}
                              className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2"
                            >
                              <option value="">שיבוץ לשולחן בלבד</option>
                              {Array.from({ length: selected.capacity }, (_, index) => index + 1)
                                .filter(
                                  (seat) =>
                                    !plan.assignments.some(
                                      (assignment) =>
                                        assignment.tableId === selected.id &&
                                        assignment.seatNumber === seat,
                                    ),
                                )
                                .map((seat) => (
                                  <option key={seat} value={seat}>
                                    מושב {seat}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <button
                            type="button"
                            onClick={assignNamedMember}
                            disabled={!selectedMemberId}
                            className="rounded-lg bg-gold/20 px-3 py-2 font-semibold ring-1 ring-gold/40 disabled:opacity-40"
                          >
                            שבצו משתתף
                          </button>
                        </div>
                      )
                    )}
                    <ul className="space-y-2" aria-label="שיבוצים לשולחן">
                      {selectedAssignments.map((assignment) => {
                        const guest = guestSource.allGuests.find(
                          (item) => item.id === assignment.guestId,
                        );
                        const member =
                          assignment.memberId && !memberSource.error && !memberSource.loading
                            ? memberSource.members.find((item) => item.id === assignment.memberId)
                            : null;
                        return (
                          <li key={assignment.id} className="rounded-lg bg-secondary/60 p-2">
                            <p>
                              {assignment.memberId
                                ? member?.full_name?.trim() || "משתתף אישי שאינו זמין ברשימה"
                                : (guest?.full_name ?? "קבוצה שכבר אינה ברשימה")}{" "}
                              · {assignment.count} {assignment.count === 1 ? "מקום" : "מקומות"}
                              {assignment.seatNumber ? ` · מושב ${assignment.seatNumber}` : ""}
                            </p>
                            {canEdit && !selected.locked && (
                              <div className="mt-2 flex flex-wrap gap-2">
                                {assignment.memberId &&
                                  !memberSource.loading &&
                                  !memberSource.error && (
                                    <select
                                      aria-label={`מושב עבור ${member?.full_name?.trim() || "משתתף"}`}
                                      value={assignment.seatNumber ?? ""}
                                      onChange={(event) =>
                                        changeSeat(assignment.id, event.target.value)
                                      }
                                      className="rounded border border-border bg-background px-2 py-1"
                                    >
                                      <option value="">ללא מושב מסוים</option>
                                      {Array.from(
                                        { length: selected.capacity },
                                        (_, index) => index + 1,
                                      )
                                        .filter(
                                          (seat) =>
                                            seat === assignment.seatNumber ||
                                            !plan.assignments.some(
                                              (item) =>
                                                item.tableId === selected.id &&
                                                item.seatNumber === seat,
                                            ),
                                        )
                                        .map((seat) => (
                                          <option key={seat} value={seat}>
                                            מושב {seat}
                                          </option>
                                        ))}
                                    </select>
                                  )}
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
      <p className="mt-4 text-sm text-muted-foreground print:hidden">
        {plan.tables.length} שולחנות · {plan.tables.reduce((sum, table) => sum + table.capacity, 0)}{" "}
        מקומות ישיבה · {plan.objects.length} אובייקטים · {layoutState.drafts.length} חלופות ·{" "}
        {totalOccupied} משובצים ·{" "}
        {Math.max(0, guestSizes.reduce((sum, guest) => sum + guest.groupSize, 0) - totalOccupied)}{" "}
        טרם שובצו · הסקיצה אינה תוכנית הנדסית מאושרת של האולם.
      </p>
      <SeatingPrintSheet
        eventName={eventName}
        layoutName={currentDraft.name}
        plan={plan}
        guestNames={guestNames}
        memberNames={memberNames}
      />
    </main>
  );
}

/** The same print sheet is used by the live page and by the local PDF verification fixture. */
export function SeatingPrintSheet({
  eventName,
  layoutName,
  plan,
  guestNames,
  memberNames,
}: {
  eventName: string;
  layoutName: string;
  plan: SeatingPlan;
  guestNames: Readonly<Record<string, string>>;
  memberNames: Readonly<Record<string, string>>;
}) {
  const occupied = (tableId: string) =>
    plan.assignments
      .filter((assignment) => assignment.tableId === tableId)
      .reduce((sum, assignment) => sum + assignment.count, 0);
  const totalOccupied = plan.assignments.reduce((sum, assignment) => sum + assignment.count, 0);
  const shortLabel = (value: string, length = 13) =>
    value.length > length ? `${value.slice(0, length - 1)}…` : value;

  return (
    <section className="seating-print-sheet" dir="rtl" aria-label="סקיצת אולם להדפסה">
      <style>{`
        @media screen { .seating-print-sheet { display: none !important; } }
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body, #root { background: white !important; color: #17232a !important; }
          .seating-print-sheet { display: block !important; color: #17232a; font: 12pt Arial, sans-serif; }
          .seating-print-sheet * { box-sizing: border-box; }
          .seating-print-map-page { break-after: page; page-break-after: always; }
          .seating-print-board { display: block; width: 100%; height: 140mm; margin: 4mm auto 0; }
          .seating-print-title { margin: 0 0 2mm; font-size: 22pt; font-weight: 700; }
          .seating-print-meta { margin: 0 0 2mm; font-size: 11pt; }
          .seating-print-note { margin: 0; font-size: 9pt; color: #475569; }
          .seating-print-list-title { margin: 0 0 4mm; font-size: 18pt; font-weight: 700; }
          .seating-print-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4mm; }
          .seating-print-table { border: 1px solid #94a3b8; border-radius: 3mm; padding: 3mm; break-inside: avoid; page-break-inside: avoid; }
          .seating-print-table h3 { margin: 0 0 1mm; font-size: 12pt; }
          .seating-print-table ul { margin: 0; padding-inline-start: 6mm; }
          .seating-print-table li { overflow-wrap: anywhere; line-height: 1.35; }
          .seating-print-objects { margin-top: 5mm; break-inside: avoid; }
        }
      `}</style>
      <div className="seating-print-map-page">
        <h1 className="seating-print-title">סקיצת אולם · {eventName}</h1>
        <p className="seating-print-meta">
          {layoutName} · {plan.tables.length} שולחנות ·{" "}
          {plan.tables.reduce((sum, table) => sum + table.capacity, 0)} מקומות · {totalOccupied}{" "}
          משובצים
        </p>
        <p className="seating-print-note">
          טיוטה מקומית בלבד. הסקיצה אינה תוכנית הנדסית מאושרת. פרטי קשר ומתנות אינם נכללים.
        </p>
        <svg
          className="seating-print-board"
          viewBox="-70 -70 1140 790"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label="מפת שולחנות ואובייקטים בסקיצה"
        >
          <rect
            x="2"
            y="2"
            width="996"
            height="646"
            fill="white"
            stroke="#34475a"
            strokeWidth="3"
          />
          {plan.objects.map((object) => (
            <g
              key={object.id}
              transform={`translate(${object.x} ${object.y}) rotate(${object.rotation} ${object.width / 2} ${object.height / 2})`}
            >
              <rect
                width={object.width}
                height={object.height}
                rx="8"
                fill="#e0eeed"
                stroke="#326e6a"
                strokeWidth="3"
              />
              <text
                x={object.width / 2}
                y={object.height / 2}
                dominantBaseline="middle"
                textAnchor="middle"
                direction="rtl"
                fontSize="16"
                fill="#173c39"
                fontFamily="Arial, sans-serif"
              >
                {shortLabel(object.label)}
              </text>
            </g>
          ))}
          {plan.tables.map((table, index) => (
            <g
              key={table.id}
              transform={`translate(${table.x} ${table.y}) rotate(${table.rotation})`}
            >
              {table.shape === "round" ? (
                <circle r="48" fill="#fff4df" stroke="#826638" strokeWidth="3" />
              ) : (
                <rect
                  x={table.shape === "rectangle" ? -65 : -48}
                  y="-42"
                  width={table.shape === "rectangle" ? 130 : 96}
                  height="84"
                  rx="12"
                  fill="#fff4df"
                  stroke="#826638"
                  strokeWidth="3"
                />
              )}
              <text
                y="-4"
                textAnchor="middle"
                direction="rtl"
                fontSize="16"
                fill="#2e2b25"
                fontFamily="Arial, sans-serif"
              >
                {`שולחן ${index + 1}`}
              </text>
              <text
                y="20"
                textAnchor="middle"
                fontSize="14"
                fill="#2e2b25"
                fontFamily="Arial, sans-serif"
              >
                {occupied(table.id)}/{table.capacity}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="seating-print-list-page">
        <h2 className="seating-print-list-title">רשימת שולחנות ושיבוצים · {layoutName}</h2>
        <div className="seating-print-grid">
          {plan.tables.map((table, index) => (
            <article key={table.id} className="seating-print-table">
              <h3>
                {index + 1} · {table.name} · {occupied(table.id)}/{table.capacity}
              </h3>
              {plan.assignments.some((assignment) => assignment.tableId === table.id) ? (
                <ul>
                  {plan.assignments
                    .filter((assignment) => assignment.tableId === table.id)
                    .map((assignment) => {
                      const label = assignment.memberId
                        ? memberNames[assignment.memberId] ||
                          guestNames[assignment.guestId] ||
                          "שם חסר"
                        : guestNames[assignment.guestId] || "שם חסר";
                      return (
                        <li key={assignment.id}>
                          {label} · {assignment.count} {assignment.count === 1 ? "מקום" : "מקומות"}
                          {assignment.seatNumber ? ` · מושב ${assignment.seatNumber}` : ""}
                        </li>
                      );
                    })}
                </ul>
              ) : (
                <p>אין שיבוצים לשולחן זה</p>
              )}
            </article>
          ))}
        </div>
        {plan.objects.length > 0 && (
          <p className="seating-print-objects">
            אזורי האולם: {plan.objects.map((object) => object.label).join(" · ")}
          </p>
        )}
        <p className="seating-print-note">טיוטה מקומית · השינויים לא נשמרו בענן</p>
      </div>
    </section>
  );
}
