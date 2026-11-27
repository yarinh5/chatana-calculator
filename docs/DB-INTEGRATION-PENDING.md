# DB Integration Pending — Wedding בלבד

יעד יחיד: `Wedding / ehafotldengktjwzjkch`. חיבור ניהולי למסד אינו מאומת כרגע. אין להשתמש בפרויקט `Character`, להחיל migration, לשנות RLS/Auth/Storage או לייצר types מרחוק עד אימות ה־ref.

| מזהה | צורך | בדיקת Production לפני כתיבה | המשך אחרי חיבור |
| --- | --- | --- | --- |
| DB-01 | Phase 4A.1: `expense_payments` ומקדמות | schema מלא, defaults, checks, triggers, policies, grants, rows חריגים, payment values, orphan/overpayment, migration drift | דוח ראיות ו־data mapping; ללא SQL עיוור |
| DB-02 | Phase 4B: constraints ואבטחת תשלומים | תוצאות DB-01 ו־RLS runtime ל־Trial/Premium/Expired, `payments_view/edit`, cross-tenant, שינוי `expense_id` | migration reconciliation בטוחה, clean bootstrap, QA rollback |
| DB-03 | Phase 5: planned vs committed | שדות קיימים ב־`events`/`expenses`, סמנטיקת price/amount, נתוני legacy | schema מפורש ללא שינוי משמעות שדות קיימים, migration ו־RLS |
| DB-04 | Phase 1C: progress וקטגוריות משתמש | `guests.group_category`, schema ו־workspace capabilities | מודל קטגוריות וטיוטות מינימליות; dedupe מוגבל tenant; מחיקה בטוחה |
| DB-05 | Phase 7: layouts, objects, assignments, versions | `guests`, `guest_members`, RSVP, capability matrix | schema, constraints לקיבולת/שיבוץ יחיד, RLS ו־transactions |
| DB-06 | Phase 2C: campaigns | RSVP links, phone/consent fields, audit, capabilities | drafts, recipients, queue, delivery events, idempotency, webhooks אחרי ספק מאושר |
| DB-07 | Phases 8–12 | תלויות קיימות ב־events/vendors/guests | tasks, gifts extension, document metadata+Storage, Wedding Day, market prices עם RLS |
| DB-08 | Phases 13–17 | מקורות Finance/RSVP/Tasks/Seating קיימים | read models/queries לפי צורך, ללא חישובים כפולים |
| DB-09 | רוחבי | migrations היסטוריות, live schema, Auth settings, advisors | bootstrap נקי, generated types, API bypass, cross-tenant, subscription enforcement |

כל migration חדשה תיכתב רק אחרי בדיקת הנתונים והסכמה הרלוונטיים. עבודה מקומית שאינה תלויה במסד ממשיכה בענף המבודד.
