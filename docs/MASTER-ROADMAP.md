# Wedding Budget IL — Master Roadmap

מקור הדרישות: GOAL מ־2026-11-27. עבודה זו מתבצעת בענף `codex/wedding-os-offline`; אין חיבור ניהולי מאומת לפרויקט Supabase `ehafotldengktjwzjkch`. אין להחיל migrations או לפרוס יכולות שאינן מחוברות.

## סדר ותלויות

1. **תשתית ומצב קיים:** אימות חוזי הקוד, מטריצת קבלה, רשימות אינטגרציה ו־QA. אין בנייה מחדש של יכולות שכבר קיימות.
2. **Finance First:** 4C אמינות תשלומים; 5 מודל Planned/Committed/Paid/Remaining/Variance; חישובים משותפים לפני דשבורד, ציון בריאות וסימולטור.
3. **מוזמנים, RSVP והושבה:** 1C יבוא אנשי קשר וסווייפ; 7 סקיצת אולם ושיבוץ; 2C הכנת קמפייני WhatsApp. שיבוץ נשען על `guests`, `guest_members` ו־RSVP; שליחה אמיתית תלויה במסד ובספק מאושר.
4. **תפעול:** 8 משימות, 9 מתנות, 10 מסמכים, 11 יום חתונה, 12 מחירון מתוחזק.
5. **תובנות:** 13 דשבורד, 14 התראות, 15 Health Score דטרמיניסטי, 16 סימולטור שאינו כותב נתוני אמת, 17 יועץ AI עם מידע מצטבר בלבד.
6. **אינטגרציה מחוברת:** בדיקת project ref, Production audit ו־drift, migrations בסביבה נקייה, RLS/RPC/Storage/Auth/Types, בדיקות מחוברות ואישור פריסה.

## מפת מודולים בתחילת Goal

| מזהה | מודול | ראיה בקוד | מצב נוכחי |
| --- | --- | --- | --- |
| 1 | מוזמנים מתקדמים | `useGuestMembers`, `GuestDetailsDialog`, migrations | ממומש בקוד; E2E מחובר ממתין |
| 1C | יבוא אנשי קשר וסווייפ | אין מודול | NOT_STARTED |
| 2 | RSVP | `useRsvp`, `Rsvp`, `PublicRsvp`, RPC migrations | ממומש בקוד; E2E מחובר ממתין |
| 2C | קמפייני WhatsApp | קישור ידני לנמען בודד בלבד | NOT_STARTED |
| 3 | ספקים | `useVendors`, `Vendors`, migrations | ממומש בקוד; E2E מחובר ממתין |
| 4 | תשלומים ומקדמות | `useExpensePayments`, `ExpensePaymentDialog` | IN_PROGRESS; 4A.1/4B ממתינים למסד |
| 5 | Planned vs Actual | חישובי תשלום חלקיים ב־`payments.ts` | NOT_STARTED |
| 6 | Workspace והרשאות | `useWorkspace`, `Workspace`, migrations | ממומש בקוד; E2E מחובר ממתין |
| 7 | הושבה וסקיצת אולם | permission scaffolding בלבד | NOT_STARTED |
| 8 | Timeline ומשימות | אין מודול | NOT_STARTED |
| 9 | מתנות 2.0 | שדות מתנה ב־`guests` | NOT_STARTED להרחבה |
| 10 | מסמכים וחוזים | permission scaffolding בלבד | NOT_STARTED |
| 11 | Wedding Day 2.0 | `WeddingDayMode` בסיסי | NOT_STARTED להרחבה |
| 12 | מחירון שוק דינמי | `MARKET_ITEMS` קשיח | NOT_STARTED להחלפה |
| 13 | Dashboard 2.0 | `Dashboard` בסיסי | NOT_STARTED להרחבה |
| 14 | מרכז התראות | אין מודול | NOT_STARTED |
| 15 | Wedding Health Score | אין מודול | NOT_STARTED |
| 16 | סימולטור תרחישים | אין מודול | NOT_STARTED |
| 17 | AI Budget Advisor | אין מודול | NOT_STARTED |

סטטוסים מפורטים, ראיות ובדיקות מתעדכנים ב־[PRODUCT-STATUS.md](PRODUCT-STATUS.md). מפת תלויות DB נמצאת ב־[DB-INTEGRATION-PENDING.md](DB-INTEGRATION-PENDING.md).
