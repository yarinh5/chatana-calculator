# External Integrations Pending

| מזהה | ספק / החלטה | תנאי להפעלה | מצב |
| --- | --- | --- | --- |
| EXT-01 | WhatsApp Business API: מספר מרכזי או מספר מחובר של הזוג | ספק רשמי, template/consent, עלות ומודל מסחרי מאושרים, credentials בצד שרת, webhooks מאומתים, queue/idempotency | EXTERNAL_PROVIDER_PENDING; אין שליחה חיה |
| EXT-02 | AI Advisor | ספק מאושר, מפתח שרת, data minimization ללא PII של אורחים, בקרת עלות | EXTERNAL_PROVIDER_PENDING; אין תשובות AI מדומות |
| EXT-03 | `parse-guest-list` | ספק AI מאושר ומפתח; החלטה אם לפרוס או להסיר UX | EXTERNAL_PROVIDER_PENDING; כשל מציג הוספה ידנית |
| EXT-04 | Google OAuth | Client ID/Secret, provider ו־Auth redirects מאושרים | EXTERNAL_PROVIDER_PENDING; הכפתור מוסתר כברירת מחדל עד הגדרת `VITE_GOOGLE_OAUTH_ENABLED=true` אחרי אימות, Email Auth קיים |
| EXT-05 | Hosting/Auth URL | Production URL ופרויקט hosting מאומתים | להגדיר Site URL, Redirect URLs ומשתני hosting לאחר אימות |
| EXT-06 | Native Contacts ל־iOS/Android | מעטפת native והרשאת משתמש | Web משתמש ב־picker נתמך/קובץ/ידני; אין הבטחת סנכרון מלא |
| EXT-07 | Email/Push notifications | ספק, הסכמה, מדיניות תדירות ואימות delivery | אין להציג שליחה ללא backend מחובר |

אין להמציא מחיר WhatsApp, לאשר הוצאה, או לשמור סודות בריפו.
