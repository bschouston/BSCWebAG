# Fantasy app (`apps/fantasy`)

Separate Next.js app for BSC Fantasy sports, same Firebase project as web/tracker.

## Local development

1. Env is already copied from Tracker if you ran setup (`apps/fantasy/.env.local`).
2. From repo root: `npm run dev:fantasy`
3. Open [http://localhost:3002](http://localhost:3002)

## Your Vercel checklist (do once)

1. Vercel → **Add New Project** → same GitHub repo `BSCWebAG`
2. **Root Directory** = `apps/fantasy` (important)
3. Leave install/build as in `vercel.json` (monorepo install + `npm run build --workspace=@bsc/fantasy`)
4. **Environment variables**: copy the same Firebase vars from your Tracker project (client `NEXT_PUBLIC_FIREBASE_*` + `FIREBASE_SERVICE_ACCOUNT_KEY` / `FIREBASE_PROJECT_ID`)
5. Optional: `NEXT_PUBLIC_WEB_URL` = your main site URL
6. Deploy, then **Domains** → add e.g. `fantasy.burhanisportsclub.com`
7. Firebase Console → Authentication → **Settings** → **Authorized domains** → add that hostname
8. Deploy Firestore + Storage rules (from this repo) so fantasy users can read live stats and upload team photos

## Main site admin

After deploying web: **Admin → Fantasy Logins** to create password Fantasy admins and disable Google players.
