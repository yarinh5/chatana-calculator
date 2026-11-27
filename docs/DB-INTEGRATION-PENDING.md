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

## חוזים שיש לאמת לפני migration

- **Finance 5:** `expenses.price` ו־`meal_price` כבר משמשים כעלות מחויבת מחושבת; אין לשנות את משמעותם. מועמד לשדה תכנון נפרד הוא `planned_cost` nullable לכל הוצאה ו־`planned_budget` nullable לאירוע. `null` מציין שטרם הוגדר סכום, ואינו אפס. יש להחליט כיצד שינוי כמות אורחים משפיע על עלות מנה לפני שמירה או backfill.
- **Contacts 1C:** פרטי אנשי קשר שנדחו לא יישמרו כברירת מחדל. טיוטת התקדמות, אם תאושר, תכיל מינימום מזהים/החלטות עם מדיניות מחיקה. קטגוריות המשתמש זקוקות ל־workspace scope, שם/צבע/סדר ו־FK בטוח ל־guest group; `group_category` הקיים חייב reconciliation ללא דריסת ערכים.
- **Seating 7:** layout versions, tables, objects ו־assignments צריכים `event_id`/layout scope. האכיפה חייבת למנוע שיבוץ כפול ומשתתף חוצה אירוע, לתמוך בחלוקת קבוצה עד `group_size`, ולשמר שיבוצים לאחר הקטנת קיבולת תוך סימון חריגה. עריכה מקבילה דורשת version/transaction semantics; capabilities `seating_view/edit` קיימות אך יש לאמת אותן ב־Production.
- **Campaigns 2C:** raw RSVP token אינו נשמר ב־draft או ב־queue. לפני שליחה יש לקבוע אם קישור אישי מיוצר בזמן queue מאובטח או נשמר כ־reference מוצפן; ה־DB ישמור idempotency key, מצב מסירה ו־audit נפרדים מ־RSVP status. Webhook חייב אימות חתימה והגנה מפני replay. סכמת המסירה תותאם לספק רשמי ולמודל עלות מאושר בלבד.
- **Storage 10:** metadata של מסמך ב־Workspace ואובייקט Storage פרטי חייבים מדיניות עקבית במחיקה, הרשאות צפייה/העלאה והגנה מפני קישור חוצה אירוע. אין להסיק שניתן לאחסן מסמכים מהיכולת `documents_view/edit` לבדה.
