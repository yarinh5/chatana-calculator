import { useMemo, useState } from "react";
import { AppTopBar } from "@/components/AppTopBar";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  compareScenarios,
  simulateScenario,
  type ScenarioInput,
  type ScenarioResult,
} from "@/lib/scenario-domain";
import { formatILS } from "@/lib/wedding-data";

type Draft = Record<keyof ScenarioInput, string>;
type Calculation = { result: ScenarioResult | null; error: string | null };

const EMPTY_DRAFT: Draft = {
  invitedGuests: "",
  attendanceRate: "",
  mealPrice: "",
  extraCostPerAttendee: "",
  fixedCosts: "",
  averageGift: "",
  budget: "",
};

const FIELDS: { key: keyof Draft; label: string; suffix: string; step: string }[] = [
  { key: "invitedGuests", label: "מספר מוזמנים", suffix: "אנשים", step: "1" },
  { key: "attendanceRate", label: "שיעור הגעה צפוי", suffix: "%", step: "0.1" },
  { key: "mealPrice", label: "מחיר מנה", suffix: "₪", step: "0.01" },
  { key: "extraCostPerAttendee", label: "עלות נוספת למגיע", suffix: "₪", step: "0.01" },
  { key: "fixedCosts", label: "עלויות קבועות", suffix: "₪", step: "0.01" },
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
  if (values.attendanceRate > 100) {
    return { result: null, error: "שיעור ההגעה צריך להיות בין 0 ל־100 אחוזים." };
  }
  try {
    return {
      result: simulateScenario({
        invitedGuests: values.invitedGuests,
        attendanceRate: values.attendanceRate / 100,
        mealPrice: values.mealPrice,
        extraCostPerAttendee: values.extraCostPerAttendee,
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
}: {
  title: string;
  draft: Draft;
  onChange: (next: Draft) => void;
}) {
  return (
    <fieldset className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
      <legend className="px-2 font-display text-xl text-foreground">{title}</legend>
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
}: {
  title: string;
  calculation: Calculation;
  budgetEntered: boolean;
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
            <dt className="text-muted-foreground">מגיעים צפויים</dt>
            <dd className="font-semibold tabular-nums">{result.expectedAttendees}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">הוצאות צפויות</dt>
            <dd className="font-semibold tabular-nums">{formatILS(result.expectedExpenses)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">הכנסות ממתנות</dt>
            <dd className="font-semibold tabular-nums">{formatILS(result.expectedGiftIncome)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">הכנסות פחות הוצאות</dt>
            <dd className="font-semibold tabular-nums">{formatILS(result.expectedProfit)}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">פער מול המסגרת</dt>
            <dd className="font-semibold tabular-nums">
              {budgetEntered ? formatILS(result.budgetVariance) : "לא הוגדרה מסגרת"}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">מתנה ממוצעת לאיזון</dt>
            <dd className="font-semibold tabular-nums">
              {result.breakEvenGift === null
                ? "לא ניתן לחשב ללא מגיעים"
                : formatILS(result.breakEvenGift)}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}

function ScenarioEditor() {
  const [base, setBase] = useState<Draft>({ ...EMPTY_DRAFT });
  const [alternative, setAlternative] = useState<Draft>({ ...EMPTY_DRAFT });
  const baseCalculation = useMemo(() => calculate(base), [base]);
  const alternativeCalculation = useMemo(() => calculate(alternative), [alternative]);
  const comparison =
    baseCalculation.result && alternativeCalculation.result
      ? compareScenarios(baseCalculation.result, alternativeCalculation.result)
      : null;

  return (
    <div className="space-y-5">
      <p role="note" className="rounded-2xl bg-gold/10 p-4 text-sm text-foreground">
        אלה תרחישים היפותטיים בלבד. כל המספרים מוזנים כאן ידנית; נתוני האירוע אינם נטענים או משתנים.
        הטיוטה אינה נשמרת, ורענון או מעבר לאירוע אחר ימחקו אותה. שדות ריקים מחושבים כאפס.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <ScenarioForm title="תרחיש בסיס" draft={base} onChange={setBase} />
        <ScenarioForm title="תרחיש חלופי" draft={alternative} onChange={setAlternative} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <ResultCard
          title="תוצאת הבסיס"
          calculation={baseCalculation}
          budgetEntered={base.budget.trim() !== ""}
        />
        <ResultCard
          title="תוצאת החלופה"
          calculation={alternativeCalculation}
          budgetEntered={alternative.budget.trim() !== ""}
        />
      </div>
      <section className="rounded-2xl bg-card p-4 ring-1 ring-border sm:p-5">
        <h2 className="font-display text-lg">השוואת החלופה לבסיס</h2>
        {comparison ? (
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">שינוי בהוצאות</dt>
              <dd className="font-semibold tabular-nums">
                {formatILS(comparison.expenseDifference)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">שינוי בהכנסות</dt>
              <dd className="font-semibold tabular-nums">
                {formatILS(comparison.incomeDifference)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">שינוי ביתרה</dt>
              <dd className="font-semibold tabular-nums">
                {formatILS(comparison.profitDifference)}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            הזינו נתונים תקינים בשני התרחישים כדי לראות את ההפרש.
          </p>
        )}
      </section>
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
