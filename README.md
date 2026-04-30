# BSC Monorepo

This repo is a **single GitHub monorepo** with:

- `apps/web`: Website + Admin Console (existing app)
- `apps/tracker`: Tracker Console (new)
- `packages/shared`: shared types/schemas + stat tracker registry
- `packages/ui`: shared UI components + `cn()` helper (shadcn/Tailwind-based)

## Prereqs

- Node.js (recommended: latest LTS)
- npm (workspaces)

## Install

```bash
npm install
```

## Run locally

### Web (website/admin)

```bash
npm run dev:web
```

Default: `http://localhost:3000`

### Tracker

```bash
npm run dev:tracker
```

Default: `http://localhost:3001`

## Firebase environment variables

Both apps use the same Firebase project.

### Client (Web SDK) env vars

Set these (typically in each app’s `.env.local`):

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` (optional)

### Server (Admin SDK) env vars

The apps use Firebase Admin for server routes. Set **one** of:

- `FIREBASE_SERVICE_ACCOUNT_KEY_PATH` (path to service account JSON), OR
- `FIREBASE_SERVICE_ACCOUNT_KEY` (service account JSON string)

And:

- `FIREBASE_PROJECT_ID`

## Roles / assigning access

Roles are stored in Firestore under `users/{uid}.role` and mirrored to a custom claim.

Supported roles:

- `MEMBER`
- `ADMIN`
- `SUPER_ADMIN`
- `TRACKER`

### Set a user’s role (admin-only)

Use the existing admin API route in the Web app:

- `PUT /api/admin/users/:uid/role`
- Body: `{ "role": "TRACKER" }` (or `ADMIN`, `SUPER_ADMIN`, `MEMBER`)
- Requires an **admin** bearer token in `Authorization: Bearer <idToken>`

## Tournament + tracker flow (V1)

### Admin Console

- Create tournaments in: `/admin/tournaments/new`
- Choose `statTrackerId` (currently `volleyball.v1`)
- Manage tournament area:
  - Players: `/admin/tournaments/:tournamentId/players`
  - Teams: `/admin/tournaments/:tournamentId/teams`
  - Schedule: `/admin/tournaments/:tournamentId/schedule`
  - Stats: `/admin/tournaments/:tournamentId/stats` (placeholder)

### Tracker Console

- Login at `/login`
- Home shows **active tournaments**
- Tournament shows matches grouped by status
- Match → choose team A/B → **Start tracking**
- Tracking page is a **placeholder in V1** (the real Volleyball stat tracker UI is V2)

## Emulator usage (optional)

This repo includes:

- `firebase.json`
- `firestore.rules`
- `storage.rules`

If you use Firebase emulators locally, run them from the repo root (requires Firebase CLI installed):

```bash
firebase emulators:start
```

