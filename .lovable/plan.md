## מטרה
המרת הפרויקט מ־TanStack Start (SSR + Nitro + Cloudflare Workers) ל־React + Vite SPA טהור, כך שיפרס ב־Vercel עם `dist` כ־output, בלי לשבור פונקציונליות, אבטחה או נתונים.

## Audit — מצב קיים

**TanStack Start / SSR / Server:**
- `vite.config.ts` — משתמש ב־`@lovable.dev/vite-tanstack-config` עם `nitro: { preset: "vercel" }`
- `src/server.ts` — SSR entry עם h3 error handling
- `src/start.ts` — TanStack Start init עם middleware
- `src/router.tsx` — TanStack Router
- `src/routes/__root.tsx` + כל הקבצים ב־`src/routes/` — file-based routing עם `createFileRoute`, `HeadContent`, `Scripts`
- `src/routeTree.gen.ts` — נוצר אוטומטית

**Server Functions (createServerFn):**
- `src/lib/admin.functions.ts` — 8 פונקציות אדמין: `adminListUsers`, `adminCreateUser`, `adminInviteUser`, `adminToggleActive`, `adminResetPassword`, `adminDeleteUser`, `adminGetUserEventId`, `adminUpdateUser` — **כולן משתמשות ב־`supabaseAdmin` (service role)** ⚠️ רגיש
- `src/lib/api/example.functions.ts` — דוגמה בלבד, למחיקה

**קבצי `.server.ts`:**
- `src/integrations/supabase/client.server.ts` — service role client
- `src/integrations/supabase/auth-middleware.ts` — bearer validation
- `src/integrations/supabase/auth-attacher.ts` — client bearer injection
- `src/lib/config.server.ts` — server env
- `src/lib/error-capture.ts`, `error-page.ts` — SSR error handling

**חשיפת SERVICE_ROLE:** רק בצד השרת (`client.server.ts`) — לא בבאנדל קליינט. אחרי המרה ל־SPA, service role יעבור ל־Supabase Edge Functions בלבד.

## תוכנית המרה

### 1. Stack חדש
- הסרה: `@tanstack/react-start`, `@tanstack/react-router`, `@tanstack/react-start-*`, `@lovable.dev/vite-tanstack-config`, `h3`, Nitro
- הוספה: `react-router-dom@6`, `vite`, `@vitejs/plugin-react-swc`, `@tailwindcss/vite`
- שמירה: `@tanstack/react-query` (עובד גם ב־SPA), Supabase, framer-motion, shadcn/ui, tailwind, framer

### 2. Vite חדש
- `vite.config.ts` חדש — `defineConfig` רגיל, `plugins: [react(), tailwindcss()]`, alias `@` → `./src`, `build.outDir: 'dist'`
- `index.html` חדש בשורש עם `<div id="root">`, `lang="he" dir="rtl"`, meta ראשי, links לפונטים ולסטיילים
- `src/main.tsx` חדש — `createRoot` + Router + QueryClient + AuthProvider + Toaster

### 3. Routing — המרה ל־react-router-dom
מיפוי 1:1 של הראוטים הקיימים:
- `/` → LandingPage (מ־`src/routes/index.tsx`)
- `/dashboard` → WeddingCalculator wrapper (מוגן)
- `/admin` → Admin (מוגן + role check)
- `/login`, `/register`, `/forgot-password`, `/reset-password` — פומביים
- 404 → NotFound

הגנת ראוטים: `<ProtectedRoute>` ו־`<AdminRoute>` שקוראים ל־`useAuth()`, מציגים loading, ומפנים ל־`/login` או `/` בהתאם.

Head/SEO ב־SPA: שימוש ב־`react-helmet-async` לכל דף כדי לשמר title/description/og.

### 4. המרת Server Functions ל־Edge Functions
כל `admin.functions.ts` דורש service role — לא ניתן להעביר לקליינט. המרה ל־**Supabase Edge Function** אחת `admin-actions` (עם `verify_jwt = true`) שמקבלת `{action, payload}` ומוודאת שהקורא הוא admin לפני כל פעולה:

```ts
// supabase/functions/admin-actions/index.ts
// action: 'list_users' | 'create_user' | 'invite_user' | 'toggle_active'
//       | 'reset_password' | 'delete_user' | 'get_user_event' | 'update_user'
```

בקליינט: `src/lib/admin-api.ts` שעוטף `supabase.functions.invoke('admin-actions', {body: {action, payload}})` ומייצא את אותן חתימות שהיו לפונקציות המקוריות, כדי לצמצם שינויים ב־`src/routes/admin.tsx`.

### 5. עדכון קומפוננטות
- `src/routes/admin.tsx` → `src/pages/Admin.tsx` — החלפת `useServerFn(adminX)` ב־`adminX` מ־`admin-api.ts`
- שאר הראוטים → `src/pages/*.tsx` — החלפת `createFileRoute`, `Link` מ־`@tanstack/react-router` ל־`react-router-dom`, `useNavigate`, `useSearchParams`
- `AppTopBar.tsx`, `AuthShell.tsx` — התאמת imports של Link/navigate

### 6. Auth flow
- `src/hooks/use-auth.tsx` — כבר משתמש ב־`supabase.auth` ישירות, מעבר חלק. הסרת תלות ב־router של TanStack (אם קיימת).
- OAuth redirect — עדכון `redirect_uri` ל־`window.location.origin` (public).

### 7. Vercel deployment
- **Framework Preset:** Vite
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Root Directory:** `./`
- **`vercel.json`:**
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```
- **Env vars ב־Vercel (client build):**
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_PUBLISHABLE_KEY`
  - `VITE_SUPABASE_PROJECT_ID`
- SERVICE_ROLE נשאר רק ב־Supabase Edge Function secrets — לא נדרש ב־Vercel.

### 8. קבצים למחיקה
- `src/server.ts`, `src/start.ts`, `src/router.tsx`, `src/routeTree.gen.ts`
- `src/routes/__root.tsx`, `src/routes/README.md`
- `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/config.server.ts`
- `src/lib/admin.functions.ts`, `src/lib/api/example.functions.ts`
- `src/integrations/supabase/client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`
- כל `src/routes/*.tsx` (אחרי העברת התוכן ל־`src/pages/`)

### 9. QA לפני סיום
- `npm install` נקי
- `npm run build` יוצר `dist/`
- בדיקה בסנדבוקס עם Playwright: `/`, login, dashboard, admin, refresh על deep-link
- וידוא שאין `SUPABASE_SERVICE_ROLE_KEY` בבאנדל: `grep -r "service_role" dist/`

## סיכונים ונקודות תשומת לב
1. **אבדן SSR head tags** — SEO מסתמך על `react-helmet-async` client-side. Meta ראשי ב־`index.html` כברירת מחדל.
2. **File-based routing** — צריך מיפוי ידני. יכול לגרום לבאגים אם ראוט מפוספס.
3. **`admin-actions` Edge Function** — חייב הרשאה קפדנית (`has_role(auth.uid(),'admin')`) לפני כל פעולה, אחרת = privilege escalation.
4. **`AuthProvider`** — לוודא שהוא לא מסתמך על TanStack router hooks; אם כן, החלפה ל־`useNavigate` של react-router.
5. **הקישור בין קומיטים** — המרה גדולה. מומלץ לעשות זאת בכל־המחיקות־ואז־כל־היצירות בקומיט אחד (`chore: migrate from TanStack Start SSR to Vite SPA`).

## שם קומיט מומלץ
`chore: migrate from TanStack Start SSR to Vite SPA + move admin ops to Edge Function`

## אישור נדרש
המרה זו נוגעת ב־~30 קבצים ומחליפה את שלד הפרויקט. **לפני שאני מתחיל**, אני צריך אישור שלך על:
1. שימוש ב־`react-router-dom` (ולא Wouter/TanStack Router רגיל בלי Start)
2. איחוד כל פונקציות האדמין ל־Edge Function אחת עם switch על `action` (במקום 8 Edge Functions נפרדות)
3. יצירת `src/pages/*` והמחיקה של `src/routes/*`
