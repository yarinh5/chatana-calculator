# QA Report

## Baseline — 2026-11-27

- Git: worktree מבודד מ־`b88dc89`, ענף `codex/wedding-os-offline`. השינויים המקוריים (`package-lock.json`, `.agents/`, `AGENTS.md`, `docs/video-marketing-agent.md`, `marketing/`) נשארו מחוץ ל־worktree.
- Inventory: routes קיימים ל־Dashboard/Guests/Workspace/RSVP/Vendors/Admin/Pricing; מודולים 1/2/3/6 קיימים בקוד. ראה `MASTER-ROADMAP.md`.
- Supabase: אין חיבור ניהולי מאומת ל־Wedding. לא נעשתה בדיקת DB/Advisors חדשה ולא נגעו ב־Production.
- Build/lint על הגרסה החדשה: טרם רצו. דוחות עבר מציינים build עובר ו־lint מלא נכשל על baseline Prettier/CRLF; תוצאה זו אינה בדיקת הרוויזיה הנוכחית.

## חבילה 1 — 4C, Finance domain ו־Contacts parser

- `npm ci --no-audit --no-fund`: נכשל; lockfile ב־HEAD חסר `xlsx` ותלויותיה אף שהן ב־`package.json`. הותקנו תלויות ל־worktree עם `npm install --package-lock=false`; לא שונה קובץ הנעילה של המשתמש.
- `node --experimental-strip-types --test src/lib/contact-import.test.mjs tests/financial-domain.test.mjs`: 10/10 עברו. הבדיקות מכסות נרמול טלפונים, CSV/vCard, כפולים, סכומים, נתונים חסרים, תשלום יתר וקלט כספי לא תקין.
- `npm run build`: עבר, עם אזהרת chunk מעל 500KB.
- `npx tsc --noEmit`: נכשל על 28 שגיאות בקבצים קיימים `useGuests`, `useRsvp`, `vendors`, `PublicRsvp`; לא נמצאו שגיאות בקבצי החבילה החדשים.
- `npx eslint --quiet` על קבצי Phase 4C ו־contacts: עבר. קובץ Finance domain תוקן לפי Prettier ונבדק שוב לפני commit.
- QA מחובר, בדיקות RLS/Subscription, וסשן דפדפן מאומת לא בוצעו; אין חיבור Wedding מאומת.

אין להסיק מ־build או מבדיקות היחידה שאינטגרציה מחוברת עובדת.

## חבילה 2 — טיוטת קמפיין, סקיצת אולם וסימולטור בסיסי

- `node --experimental-strip-types --test tests/rsvp-campaign.test.mjs tests/seating-domain.test.mjs tests/scenario-domain.test.mjs`: 12 בדיקות עברו בסך הכול בסבבים ממוקדים. קמפיין מזהה משתנים/כפילויות/חסר קישור; הושבה חוסמת חריגת קיבולת ושיבוץ כפול; סימולטור מחשב חלופות ללא שינוי נתוני אמת.
- `npm run build`: עבר בכל חבילת UI שנמסרה (RSVP draft, SeatingStudio, FinancialBreakdown), עם אזהרת chunk גדול.
- ESLint ממוקד עבר בקבצים החדשים והקבצים ששונו; ב־`WeddingCalculator.tsx` נותרו שתי אזהרות Fast Refresh קיימות.
- `npm run lint` מלא על ה־worktree: נכשל, exit 1, `14702 problems (14684 errors, 18 warnings)`; רובם `prettier/prettier` על CRLF בקבצים קיימים תחת `core.autocrlf=true`. לא בוצע תיקון גורף שאינו קשור למשימות.
- מסכי RSVP/הושבה דורשים סשן Workspace; לא בוצע E2E מחובר. טיוטת הקמפיין והסקיצה אינן נשמרות או שולחות דבר.

## חבילה 3 — אינטגרציה מקומית ונתוני אמת מוגבלים

- נעילת התלויות סונכרנה, ולאחר מכן הוחלפה `xlsx@0.18.5` ב־`read-excel-file@9.3.20` וב־`write-excel-file@4.1.1`. `npm ci` עבר אחרי ההחלפה. קריאת/כתיבת XLSX בשני גיליונות, טקסט שנראה כנוסחה, גבולות גודל ושורות נבדקו; `.xls` אינו נתמך ומוצגת הנחיה להמרה.
- `npx tsc --noEmit`: עבר אחרי תיקון ממוקד של ערכי RPC אופציונליים, בחירת קמפיין ובדיקת הצעת מחיר לספק. לא שונו SQL או generated types.
- `npm run build`: עבר אחרי חיבור מסכים מקומיים למסמכים, הסעות, התראות ומחירון. נשאר warning על chunk מעל 500KB.
- בדיקות ממוקדות: Excel 4/4; משימות 4/4; Health Score 5/5; מסמכים/התראות/הסעות 12/12; מחירון 3/3; הושבה 7/7. לינט ממוקד לקבצים שנבדקו עבר.
- סקירת Dashboard: כרטיסי מוזמנים/RSVP/ספקים/מספר הוצאות נטענים ממקורות חיים רק לפי capabilities. אין גרפים כספיים או Health Score מספרי כשאין מספיק נתונים.
- טיוטות מסמכים/משימות/הסעות/מחירון/הושבה אינן שמורות. הדפסת הושבה משתמשת בדפדפן; PDF בפועל טרם אומת. מרכז ההתראות מציג רק מקורות ידועים, וסימון כנקרא זמני.
- QA מחובר ל־Wedding, בדיקות RLS/API bypass, Browser E2E עם session, Mobile authenticated, Storage ו־WhatsApp לא בוצעו. אין ראיה מספקת לקבלת מוצר.
- `npm audit --omit=dev` אחרי החלפת Excel עדיין דיווח על שבעה ממצאי High בתלויות אחרות; אין ממצא `xlsx`. נדרש triage ממוקד לפני פריסה.

## חבילה 4 — השלמות מקומיות ובדיקות משולבות

- `node --experimental-strip-types --test src/lib/*.test.mjs tests/*.test.mjs`: עברו 70/70 בדיקות; כוללות טווחי מחיר, הגעה חלקית וחוזה AI מצטבר ללא פרטים אישיים.
- `npx tsc --noEmit`: עבר. `npm run build`: עבר; נשארה אזהרת chunk מעל 500KB.
- ESLint ממוקד על קבצי הקוד ששונו: עבר אחרי תיקון סיומות שורה בקבצי Landing/Auth. `git diff --check`: עבר, עם אזהרות Git על LF/CRLF בלבד.
- תוקן ניסוח שיווקי שטען למחירי שוק מעודכנים בשנת 2025; המחירים המובנים מוצגים כדוגמאות בלבד. כפתורי Google Login/Register מוסתרים כברירת מחדל עד חיבור ספק והרשאות redirect.
- בדיקת דפדפן ציבורית: `/pricing` נטען, `/documents` הפנה ל־`/login` ללא session. אחרי התיקון `/` הציג במפורש מחירים להמחשה, ו־`/login` ו־`/register` לא הציגו כפתור Google. אין QA מחובר או Mobile authenticated.
- `npm run lint` מלא אחרי שינוי Prettier ל־`endOfLine: auto`: נכשל, exit 1, `96 problems (81 errors, 15 warnings)`; נשארו formatting נקודתי ושבע שגיאות קוד בקבצי legacy/Edge. אין לטעון שעבר.

## חבילה 5 — תיקוני לינט, אנשי קשר ו־Dashboard

- תיקוני formatting וחוזה קלט ב־`admin-actions` הורידו את שגיאות ה־lint המלא לאפס. `npm run lint` על המצב הנוכחי עבר ב־exit 0 עם 15 אזהרות Fast Refresh/Hook קיימות; אין ראיית deploy או בדיקת Deno ל־Edge Function.
- בחירת אנשי קשר: סווייפ אופקי, כפתורים ומקלדת; Undo, החלטות ״מזמין/לא מזמין/אולי/דילוג״, סיכום התקדמות, קטגוריות טיוטה, ושמירה ל־`guests` רק למי שסומן להזמנה. טעינת קובץ חדש מנקה גם קטגוריות מהטיוטה הקודמת. 14 בדיקות domain עברו. לא בוצע Browser E2E מחובר או בדיקת מחוות במכשיר אמיתי.
- Dashboard: ימים לחתונה לפי תאריך ישראלי, מצב ספקים והתפלגות RSVP, עם נתוני RPC מצומצמים, pagination וספירה מדויקת. 6 בדיקות domain עברו. אין QA מחובר מול הרשאות Production.
- קמפיין RSVP: חוזה סטטוס מסירה מקומי נבדק ב־3 תרחישים של receipts מאוחרים, retry ו־cancellation. אין queue, ספק, שליחה או webhook מחוברים.
- טעינת routes פוצלה לפי דרישה. בדפדפן המקומי `/` ו־`/pricing` נטענו בפועל, ו־`/dashboard` ללא session הפנה ל־`/login`. bundle עדיין מציג אזהרת chunk של כ־526KB.
- סקיצת אולם: מידות, יחידות, מלבן/אליפסה, אזור גרפי, Canvas והדפסה עקביים; שינוי מידה משמר שיבוצים ומסמן חריגות. יצירת שולחן חדש שאינו נכנס לאולם קטן נחסמת. PDF לדוגמה של אולם ברירת מחדל נשמר ב־`output/pdf/seating-print-qa.pdf`, ועוד PDF מקומי לאולם אליפטי נבדק חזותית מחוץ לריפו. אין QA הדפסה מחובר עם נתוני משתמש.
- אבטחת תלויות: `npm audit fix` עדכן גרסאות תואמות, ו־Zod 3 הוסר לאחר שלא נמצא שימוש בו בקוד. `package-lock.json` ו־`bun.lock` סונכרנו; `npm ci` עבר לאחר עצירת dev server שנעל קובץ native ב־Windows. גם תלויות פיתוח ב־Bun עודכנו בגרסאות תואמות. `npm audit` מלא ו־`bun audit` מלא חזרו ללא ממצאים.
- בדיקות משולבות מקומיות ברוויזיה הסופית של חבילה זו: 93/93 unit tests, `npx tsc --noEmit`, `npm run build` ו־`npm run lint` עברו. ב־lint נותרו 15 warnings; ב־build נותרה אזהרת bundle על כ־528KB. אין להסיק מכך על הצלחת DB/RLS/Auth/Storage/WhatsApp או UX מחובר.
