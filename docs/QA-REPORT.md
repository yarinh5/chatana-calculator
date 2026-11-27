# QA Report

## Baseline — 2026-11-27

- Git: worktree מבודד מ־`b88dc89`, ענף `codex/wedding-os-offline`. השינויים המקוריים (`package-lock.json`, `.agents/`, `AGENTS.md`, `docs/video-marketing-agent.md`, `marketing/`) נשארו מחוץ ל־worktree.
- Inventory: routes קיימים ל־Dashboard/Guests/Workspace/RSVP/Vendors/Admin/Pricing; מודולים 1/2/3/6 קיימים בקוד. ראה `MASTER-ROADMAP.md`.
- Supabase: אין חיבור ניהולי מאומת ל־Wedding. לא נעשתה בדיקת DB/Advisors חדשה ולא נגעו ב־Production.
- Build/lint על הגרסה החדשה: טרם רצו. דוחות עבר מציינים build עובר ו־lint מלא נכשל על baseline Prettier/CRLF; תוצאה זו אינה בדיקת הרוויזיה הנוכחית.

## בדיקות חבילות עבודה

תוצאות יתווספו כאן לאחר הרצה בפועל, כולל הפקודה, הקובץ/מסלול שנבדק, תוצאה וגבולות הבדיקה. אין להסיק מ־build שעבר כי אינטגרציה מחוברת עובדת.
