import { useState } from "react";
import { validateLocalAdvisorQuestion } from "@/lib/ai-advisor";

const SUGGESTIONS = [
  "איך כדאי לבחון את התקציב?",
  "על מה כדאי לשים לב לפני סגירת תשלומים?",
  "אילו פערים בתכנון כדאי לבדוק?",
] as const;

export function AdvisorComposer() {
  const [question, setQuestion] = useState("");
  const [touched, setTouched] = useState(false);
  const validation = validateLocalAdvisorQuestion(question);
  const message =
    touched && validation === "empty"
      ? "יש לנסח שאלה לפני שליחה עתידית."
      : validation === "too_long"
        ? "השאלה ארוכה מדי. אפשר לכתוב עד 300 תווים."
        : null;

  return (
    <section className="border-b border-border bg-background" dir="rtl" aria-label="יועץ AI">
      <div className="mx-auto max-w-6xl space-y-3 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-lg text-foreground">יועץ AI לחתונה</h2>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            לא זמין כרגע
          </span>
        </div>
        <p className="max-w-2xl text-xs text-muted-foreground">
          אפשר לנסח כאן טיוטת שאלה. היא נשמרת רק כל עוד המסך פתוח, אינה נשלחת ואינה נשמרת בחשבון.
          אין להזין שמות, טלפונים, כתובות דוא״ל או מסמכים.
        </p>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setQuestion(suggestion);
                setTouched(false);
              }}
              className="rounded-full border border-border px-3 py-1.5 text-xs hover:bg-secondary"
            >
              {suggestion}
            </button>
          ))}
        </div>
        <label className="block max-w-2xl text-sm text-foreground">
          השאלה שלי
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            maxLength={500}
            placeholder="למשל: אילו תחומים בתכנון כדאי לבדוק השבוע?"
            aria-describedby="advisor-question-status"
            className="mt-1 w-full resize-y rounded-xl border border-border bg-card p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-rose"
          />
        </label>
        <div
          id="advisor-question-status"
          className="flex max-w-2xl flex-wrap items-center justify-between gap-2 text-xs"
        >
          <span
            className={message ? "text-destructive" : "text-muted-foreground"}
            role={message ? "alert" : undefined}
          >
            {message ?? "הטיוטה מקומית בלבד. אין כרגע ספק ייעוץ מאושר או פעולת שליחה."}
          </span>
          <span className="tabular-nums text-muted-foreground">{question.trim().length}/300</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled
            className="min-h-10 rounded-xl bg-secondary px-4 text-sm text-muted-foreground"
            aria-label="שליחת שאלה ליועץ AI אינה זמינה כרגע"
          >
            שליחת שאלה אינה זמינה
          </button>
          <p className="text-xs text-muted-foreground">
            לאחר חיבור שירות מאושר, נתוני העזר יוגבלו לסכומים ולמדדי תכנון מצטברים.
          </p>
        </div>
      </div>
    </section>
  );
}
