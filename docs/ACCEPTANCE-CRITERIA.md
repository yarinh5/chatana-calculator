# Acceptance Matrix

| תחום | קבלה מקומית נצפית | קבלה מחוברת שנותרה |
| --- | --- | --- |
| תשלומים 4C | כשל/אפס שורות לא מציג הצלחה; אין לחיצה כפולה; מעבר Workspace לא מעדכן מסך חדש; טעינה נכשלת אינה מוצגת כאפס תשלומים | CRUD/RLS לפי Premium, Trial, Expired והרשאות Workspace |
| Finance 5 | אותם קלטים מפיקים Planned, Committed, Paid, Remaining ו־Variance עקביים בכל רמה; סכומים לא ידועים מסומנים כלא זמינים | שדות נתונים, migration, RLS, נתונים קיימים, QA מול DB |
| Contacts 1C | יבוא בפלטפורמה נתמכת עם fallback, נרמול, כפולים, סווייפ וכפתורים/מקלדת, Undo; שום איש קשר לא נשלח ללא בחירה מפורשת | שמירת התקדמות/קטגוריות ו־guest conversion בטוחה |
| RSVP 2C | בחירת נמענים, preview משתנים, ספירת כפולים/טלפונים שגויים, draft ללא שליחה מדומה | DB queue, idempotency, consent, supplier webhooks ועלות מאושרת |
| Seating 7 | SVG/Canvas עובד בדסקטופ ומגע, קיבולת, אין שיבוץ כפול, Undo/Redo, חלופות, PDF עברי שנבדק בפועל | שמירה קבועה, הרשאות Workspace, שיתוף והצלבה עם RSVP |
| Operations 8–12 | משימות/מתנות/מסמכים/יום חתונה/מחירון מציגים מצב אמת; לא מציגים upload או עדכון שלא נשמר | schema, RLS, Storage, realtime, נתוני מחיר מתוחזקים |
| Intelligence 13–17 | חישובים נגזרים מאותו finance domain; התראות ללא כפילות; ציון שקוף; סימולציה אינה משנה נתוני אמת; AI אינו מתחזה לחיבור | נתוני אמת, ספק AI, בדיקות פרטיות והרשאות |
| רוחבי | build, TypeScript, lint ממוקד, RTL, mobile, accessibility, failure states | E2E מחובר, RLS, cross-tenant, auth, security/performance, smoke לפני השקה |

עצירה: מסמנים `LOCAL_QA_PASSED` רק אחרי בדיקות המסלול האמיתי ותרחישי הכשל הרלוונטיים בגרסה הסופית. `PRODUCT_ACCEPTED` מחייב QA מחובר ואישור פריסה.
