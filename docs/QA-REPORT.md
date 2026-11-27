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
