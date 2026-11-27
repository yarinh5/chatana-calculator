# Product Status

תאריך בסיס: 2026-11-27. סטטוסים מותרים: `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED_OFFLINE`, `LOCAL_QA_PASSED`, `DB_INTEGRATION_PENDING`, `EXTERNAL_PROVIDER_PENDING`, `CONNECTED_QA_PASSED`, `PRODUCT_ACCEPTED`.

`IMPLEMENTED_OFFLINE` או `LOCAL_QA_PASSED` אינם אישור מסחרי. אין מודול במצב `PRODUCT_ACCEPTED` עד בדיקות מחוברות ו־Production readiness.

| משימה | מצב | ראיה / קבצים | בדיקות והמשך |
| --- | --- | --- | --- |
| G-00 מיפוי ריפו וענף מבודד | LOCAL_QA_PASSED | `docs/MASTER-ROADMAP.md`, `codex/wedding-os-offline` | preflight, מפת routes/migrations; להמשיך לעדכן |
| G-01 מודולי 1/2/3/6 קיימים | DB_INTEGRATION_PENDING | hooks, pages ו־migrations קיימים | build בעבר; נדרש QA מחובר לפי הרשאות |
| G-02 Phase 4C אמינות תשלומים | LOCAL_QA_PASSED | `useExpensePayments`, `ExpensePaymentDialog`, `WeddingCalculator` | build ולינט ממוקד עברו; QA מחובר ותפקידי הרשאה ממתינים |
| G-03 Phase 4A.1/4B | DB_INTEGRATION_PENDING | `docs/DB-INTEGRATION-PENDING.md` | Production audit לפני SQL מחייב |
| G-04 Phase 5, מנוע חישובים טהור | LOCAL_QA_PASSED | `src/lib/financial-domain.ts`, `tests/financial-domain.test.mjs` | 4 בדיקות; חיבור UI ו־schema לשדות planned ממתינים |
| G-05 Phase 1C, parsing ו־preview | LOCAL_QA_PASSED | `src/lib/contact-import.ts`, `src/lib/contact-import.test.mjs` | 6 בדיקות; UI, XLSX, swipe ושמירה ממתינים |
| G-06 Phase 7 | NOT_STARTED | capability scaffolding | עורך, שיבוץ, PDF; persistence ממתין למסד |
| G-07 Phase 2C | NOT_STARTED | RSVP וקישור ידני קיימים | תכנון קמפיינים; שליחה חיה ממתינה לספק |
| G-08 Phases 8–12 | NOT_STARTED | בסיסי 9/11/12 קיימים | להרחיב ללא כפילות; נתונים קבועים ממתינים למסד |
| G-09 Phases 13–17 | NOT_STARTED | Dashboard בסיסי | אחרי Finance/Operations; AI ממתין לספק |

כל task חדש יקבל שורה עם קבצים, בדיקות, ראיות, תלות DB/ספק והמשך. ראיות ריצה נשמרות ב־[QA-REPORT.md](QA-REPORT.md).
