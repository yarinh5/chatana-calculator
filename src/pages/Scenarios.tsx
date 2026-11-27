import { useMemo, useState, type ReactNode } from "react";
import { AppTopBar } from "@/components/AppTopBar";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  compareScenarios,
  simulateScenario,
  type ScenarioInput,
  type ScenarioResult,
} from "@/lib/scenario-domain";

const formatAmount = (value: number) =>
  `${value.toLocaleString("he-IL", { maximumFractionDigits: 2 })} ₪`;
const formatDelta = (value: number) => `${value > 0 ? "+" : ""}${formatAmount(value)}`;

type Draft = Record<keyof ScenarioInput, string>;
type Calculation = { result: ScenarioResult | null; error: string | null };

const EMPTY_DRAFT: Draft = {
  invitedGuests: "",
  attendanceRate: "",
  actualGuests: "",
  mealPrice: "",
  extraCostPerAttendee: "",
  vendorCosts: "",
  fixedCosts: "",
  averageGift: "",
  budget: "",
};

const FIELDS: { key: keyof Draft; label: string; suffix: string; step: string }[] = [
  { key: "invitedGuests", label: "מספר מוזמנים", suffix: "אנשים", step: "1" },
  { key: "attendanceRate", label: "שיעור הגעה צפוי", suffix: "%", step: "0.1" },
  { key: "actualGuests", label: "אורחים בפועל (אם ידוע)", suffix: "אנשים", step: "1" },
  { key: "mealPrice", label: "מחיר מנה", suffix: "₪", step: "0.01" },
  { key: "extraCostPerAttendee", label: "עלות נוספת למגיע", suffix: "₪", step: "0.01" },
  { key: "vendorCosts", label: "עלויות ספקים", suffix: "₪", step: "0.01" },
  { key: "fixedCosts", label: "עלויות קבועות אחרות", suffix: "₪", step: "0.01" },
  { key: "averageGift", label: "מתנה ממוצעת למגיע", suffix: "₪", step: "0.01" },
  { key: "budget", label: "מסגרת תקציב להשוואה", suffix: "₪", step: "0.01" },
];

function calculate(draft: Draft): Calculation {
  if (!Object.values(draft).some((value) => value.trim() !== "")) {
    return { result: null, error: null };
  }
  const values = Object.fromEntries(
    FIELDS.map(({ key }) => [key, draft[key].trim() === "" ? 0 : Number(draft[key])]),
  ) as Record<keyof Draft, number>;
  for (const field of FIELDS) {
    if (!Number.isFinite(values[field.key]) || values[field.key] < 0) {
      return { result: null, error: `יש להזין ערך תקין שאינו שלילי בשדה ${field.label}.` };
    }
  }
  if (!Number.isSafeInteger(values.invitedGuests)) {
    return { result: null, error: "מספר המוזמנים צריך להיות מספר שלם." };
  }
  if (draft.actualGuests.trim() !== "" && !Number.isSafeInteger(values.actualGuests)) {
    return { result: null, error: "מספר האורחים בפועל צריך להיות מספר שלם." };
  }
  if (values.attendanceRate > 100) {
    return { result: null, error: "שיעור ההגעה צריך להיות בין 0 ל־100 אחוזים." };
  }
  try {
    return {
      result: simulateScenario({
        invitedGuests: values.invitedGuests,
        attendanceRate: values.attendanceRate / 100,
        actualGuests: draft.actualGuests.trim() === "" ? null : values.actualGuests,
        mealPrice: values.mealPrice,
        extraCostPerAttendee: values.extraCostPerAttendee,
        vendorCosts: values.vendorCosts,
        fixedCosts: values.fixedCosts,
        averageGift: values.averageGift,
        budget: values.budget,
      }),
      error: null,
    };
  } catch {
    return { result: null, error: "הערכים גדולים מדי לחישוב. בדקו את המספרים שהוזנו." };
  }
}

function ScenarioForm({
  title,
  draft,
  onChange,
  actions,
}: {
  title: string;
  draft: Draft;
  onChange: (next: Draft) => void;
  actions?: ReactNode;
}) {
  return (
    <fieldset className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <legend className="px-2 font-display text-xl text-foreground">{title}</legend>
      {actions && <div className="mb-3 flex flex-wrap gap-2">{actions}</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => (
          <label key={field.key} className="block text-sm">
            <span className="mb-1 block font-medium">{field.label}</span>
            <span className="flex min-h-11 items-center rounded-xl border border-input bg-background px-3">
              <input
                type="number"
                min="0"
                step={field.step}
                inputMode="decimal"
                value={draft[field.key]}
                onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })}
                className="w-full bg-transparent outline-none"
              />
              <span className="shrink-0 text-xs text-muted-foreground">{field.suffix}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function ResultCard({
  title,
  calculation,
  budgetEntered,
  actualGuestsEntered,
}: {
  title: string;
  calculation: Calculation;
  budgetEntered: boolean;
  actualGuestsEntered: boolean;
}) {
  const result = calculation.result;
  return (
    <section className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <h2 className="font-display text-lg">{title}</h2>
      {calculation.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {calculation.error}
        </p>
      ) : !result ? (
        <p className="mt-3 text-sm text-muted-foreground">הזינו לפחות נתון אחד כדי לראות חישוב.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">
              {actualGuestsEntered ? "אורחים בפועל שהוזנו" : "מגיעים לפי שיעור ההגעה"}
            </dt>
            <dd className="font-semibold tabular-nums">{result.expectedAttendees}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">הוצאות צפויות</dt>
            <dd className="font-semibold tabular-nums">{formatAmount(result.expectedExpenses)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">הכנסות ממתנות</dt>
            <dd className="font-semibold tabular-nums">
              {formatAmount(result.expectedGiftIncome)}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">רווח או הפסד צפוי</dt>
            <dd className="font-semibold tabular-nums">{formatAmount(result.expectedProfit)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">פער מול המסגרת</dt>
            <dd className="font-semibold tabular-nums">
              {budgetEntered ? formatAmount(result.budgetVariance) : "לא הוגדרה מסגרת"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">מתנה ממוצעת לאיזון</dt>
            <dd className="font-semibold tabular-nums">
              {result.breakEvenGift === null
                ? "לא ניתן לחשב ללא מגיעים"
                : formatAmount(result.breakEvenGift)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ScenarioEditor() {
  const [base, setBase] = useState<Draft>({ ...EMPTY_DRAFT });
  const [alternatives, setAlternatives] = useState<{ id: string; draft: Draft }[]>([
    { id: "first", draft: { ...EMPTY_DRAFT } },
  ]);
  const baseCalculation = useMemo(() => calculate(base), [base]);
  const calculations = useMemo(
    () => alternatives.map((alternative) => calculate(alternative.draft)),
    [alternatives],
  );

  const updateAlternative = (id: string, draft: Draft) =>
    setAlternatives((current) =>
      current.map((alternative) =>
        alternative.id === id ? { ...alternative, draft } : alternative,
      ),
    );

  return (
    <div className="space-y-5">
      <p role="note" className="rounded-2xl bg-gold/10 p-4 text-sm text-foreground">
        אלה תרחישים היפותטיים בלבד. גם ״התרחיש הקיים״ מוזן כאן ידנית; נתוני האירוע אינם נטענים או
        משתנים. הטיוטה אינה נשמרת, ורענון או מעבר לאירוע אחר ימחקו אותה. שדות ריקים מחושבים כאפס,
        מלבד ״אורחים בפועל״: שדה ריק משתמש בכמות הנגזרת משיעור ההגעה.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ScenarioForm title="תרחיש קיים · הזנה ידנית" draft={base} onChange={setBase} />
        <ResultCard
          title="תוצאת התרחיש הקיים"
          calculation={baseCalculation}
          budgetEntered={base.budget.trim() !== ""}
          actualGuestsEntered={base.actualGuests.trim() !== ""}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-xl">חלופות להשוואה ({alternatives.length})</h2>
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setAlternatives((current) => [
              ...current,
              { id: crypto.randomUUID(), draft: { ...base } },
            ])
          }
        >
          הוסף חלופה מנתוני הבסיס
        </Button>
      </div>
      {alternatives.map((alternative, index) => {
        const calculation = calculations[index];
        const comparison =
          baseCalculation.result && calculation.result
            ? compareScenarios(baseCalculation.result, calculation.result)
            : null;
        return (
          <section key={alternative.id} className="space-y-4 border-t border-border pt-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <ScenarioForm
                title={`חלופה ${index + 1}`}
                draft={alternative.draft}
                onChange={(draft) => updateAlternative(alternative.id, draft)}
                actions={
                  <>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => updateAlternative(alternative.id, { ...base })}
                    >
                      העתק מהתרחיש הקיים
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setAlternatives((current) =>
                          current.filter((item) => item.id !== alternative.id),
                        )
                      }
                    >
                      הסר חלופה
                    </Button>
                  </>
                }
              />
              <ResultCard
                title={`תוצאת חלופה ${index + 1}`}
                calculation={calculation}
                budgetEntered={alternative.draft.budget.trim() !== ""}
                actualGuestsEntered={alternative.draft.actualGuests.trim() !== ""}
              />
            </div>
            <div className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
              <h3 className="font-display text-lg">השוואת חלופה {index + 1} לתרחיש הקיים</h3>
              {comparison ? (
                <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">שינוי בהוצאות</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatDelta(comparison.expenseDifference)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">שינוי בהכנסות</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatDelta(comparison.incomeDifference)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">שינוי ברווח או בהפסד</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatDelta(comparison.profitDifference)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">חיסכון אפשרי בהוצאות</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatAmount(comparison.potentialSavings)}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  הזינו נתונים תקינים בתרחיש הקיים ובחלופה כדי לראות את ההפרש.
                </p>
              )}
              {comparison && comparison.potentialSavings > 0 && comparison.incomeDifference < 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  החיסכון בהוצאות אינו כולל את הירידה האפשרית בהכנסות; בדקו גם את השינוי ברווח.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function Scenarios() {
  const workspace = useWorkspace();
  const eventId = workspace.activeEventId;
  const subscription = useSubscription(eventId, { includeExpenseCount: false });
  const canView = !!workspace.activeWorkspace && workspace.can("budget_view");

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <AppTopBar subscription={subscription} />
      <main className="mx-auto max-w-6xl px-3 py-6 sm:px-4 md:px-6">
        <header className="mb-5">
          <h1 className="font-display text-3xl text-foreground">סימולציות תקציב</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            בדקו איך שינוי במספר המגיעים, המחירים והמתנות משפיע על התוצאה המשוערת.
          </p>
        </header>
        {workspace.loading ? (
          <p className="text-sm text-muted-foreground">טוענים סביבת עבודה...</p>
        ) : workspace.error ? (
          <p role="alert" className="text-sm text-destructive">
            לא ניתן לטעון את סביבת העבודה. נסו לרענן את העמוד.
          </p>
        ) : !workspace.activeWorkspace ? (
          <p className="text-sm text-muted-foreground">אין סביבת עבודה להצגה.</p>
        ) : !canView ? (
          <p role="alert" className="text-sm text-destructive">
            אין לך הרשאה לצפייה בתקציב של האירוע הזה.
          </p>
        ) : (
          <>
            {subscription.isExpired && (
              <p className="mb-4 rounded-xl bg-gold/10 p-3 text-sm">
                המנוי הסתיים. אפשר לחשב תרחישים מקומיים לצפייה בלבד; הם אינם משנים נתונים קיימים.
              </p>
            )}
            <ScenarioEditor key={eventId} />
          </>
        )}
      </main>
    </div>
  );
}
