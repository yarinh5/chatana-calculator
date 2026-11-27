# Product Status

עודכן: 2026-11-27. סטטוסים מותרים: `NOT_STARTED`, `IN_PROGRESS`, `IMPLEMENTED_OFFLINE`, `LOCAL_QA_PASSED`, `DB_INTEGRATION_PENDING`, `EXTERNAL_PROVIDER_PENDING`, `CONNECTED_QA_PASSED`, `PRODUCT_ACCEPTED`.

`LOCAL_QA_PASSED` מתייחס רק לחלק שנבדק מקומית. אין מודול במצב `PRODUCT_ACCEPTED` ללא בדיקות מחוברות, אבטחה ומוכנות Production.

| מודול               | מצב                       | ראיות מקומיות והמשך                                                                                                                                                  |
| ------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 מוזמנים מתקדמים   | DB_INTEGRATION_PENDING    | CRUD קיים, פירוט אישי, ייבוא/ייצוא; E2E והרשאות מחוברים נדרשים                                                                                                       |
| 1C אנשי קשר וסווייפ | IN_PROGRESS               | CSV/VCF/XLSX, Contact Picker אם נתמך, הזנה ידנית, סווייפ/מקלדת, Undo, סיכום וקטגוריות טיוטה; שמירת התקדמות וקטגוריות צבע/סדר ב־DB, שיוך מרובה ו־QA מחובר עדיין חסרים |
| 2 RSVP              | DB_INTEGRATION_PENDING    | ניהול וקישור ציבורי קיימים; E2E מחובר חסר                                                                                                                            |
| 2C קמפיינים         | EXTERNAL_PROVIDER_PENDING | בחירת נמענים, משתנים, תצוגה מקדימה, בחירת מספר מרכזי/זוגי וחוזה מקומי לרצף מסירה; queue, consent, ספק ושליחה אינם מחוברים                                            |
| 3 ספקים             | DB_INTEGRATION_PENDING    | CRUD וקישור להוצאות קיימים; E2E מחובר חסר                                                                                                                            |
| 4 תשלומים ומקדמות   | DB_INTEGRATION_PENDING    | תיקוני 4C מקומיים; 4A.1 Production audit ו־4B reconciliation עדיין ממתינים                                                                                           |
| 5 Planned vs Actual | DB_INTEGRATION_PENDING    | מנוע חישובים ופירוט לפי קטגוריה/ספק; planned אמיתי דורש שדות והסכמות DB                                                                                              |
| 6 Workspace         | DB_INTEGRATION_PENDING    | שיתוף ו־capabilities קיימים; QA מחובר חסר                                                                                                                            |
| 7 הושבה וסקיצת אולם | IN_PROGRESS               | עורך, חלופות, אובייקטים/אזורים, מידות וצורת אולם, שיבוץ קבוצה/משתתף אישי, הדפסה ו־PDF לדוגמה שנבדק; שמירה, רקע מה־Storage ו־QA מחובר חסרים                           |
| 8 משימות            | IMPLEMENTED_OFFLINE       | טיוטת משימות, תבנית, רשימה/לוח/ציר זמן; אין שמירה או שיתוף                                                                                                           |
| 9 מתנות 2.0         | IN_PROGRESS               | סיכום מתנות לפי צד ואמצעי תשלום משדות קיימים; פיקדון/צ׳קים ונתונים נוספים דורשים DB                                                                                  |
| 10 מסמכים           | IMPLEMENTED_OFFLINE       | טיוטת metadata וקבצים בזיכרון בלבד עם אימות פורמט; Storage פרטי והרשאות חסרים                                                                                        |
| 11 Wedding Day 2.0  | IN_PROGRESS               | חיפוש קבלה מהיר, הגעה חלקית, מתנות וטיוטת הסעות; שיבוץ שולחנות שמור ו־QA מחובר עדיין חסרים                                                                           |
| 12 מחירון שוק       | IN_PROGRESS               | קובץ מקומי עם טווח מינימום/טיפוסי/מקסימום, אזור ומקור לכל פריט; תחזוקה ומקור שוק מאומת עדיין חסרים                                                                   |
| 13 Dashboard 2.0    | IN_PROGRESS               | ימים לחתונה, סיכומי מוזמנים/RSVP/ספקים/הוצאות ממקורות קיימים ולפי capabilities; מדדים כספיים מתוכננים ומודולים נוספים ממתינים למקורות נתונים שמורים                  |
| 14 מרכז התראות      | IN_PROGRESS               | התראות in-app ממצב מנוי/RSVP/תאריך, סימון קריאה זמני; מקורות נוספים ושמירה חסרים                                                                                     |
| 15 Health Score     | IN_PROGRESS               | מנוע דטרמיניסטי עם כיסוי נתונים וספי אמינות; ציון לא מוצג כשאין די מקורות חיים                                                                                       |
| 16 סימולטור         | IMPLEMENTED_OFFLINE       | חישוב והשוואת תרחישים מקומיים; אין החלה על נתוני אמת                                                                                                                 |
| 17 AI Advisor       | EXTERNAL_PROVIDER_PENDING | חוזה aggregate-only וטיוטת שאלה מקומית; אין ספק מאושר, שליחה או תשובות AI חיות                                                                                       |

ה־Goal פעיל. העבודה בענף `codex/wedding-os-offline`; אין חיבור ניהולי מאומת ל־Wedding ולכן אין migrations/Storage/Auth/Edge deploy או QA מחובר חדשים. פרטי המשך ב־[DB-INTEGRATION-PENDING.md](DB-INTEGRATION-PENDING.md), [EXTERNAL-INTEGRATIONS-PENDING.md](EXTERNAL-INTEGRATIONS-PENDING.md) ו־[QA-REPORT.md](QA-REPORT.md).
