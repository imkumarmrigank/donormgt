# FreePathshala Donor Manager — Setup and Deployment

One Node service: Express serves the API at `/api/v1` and the built React app from
`Frontend/dist`. Data lives in Neon Postgres; uploaded files live in Cloudinary.

- Live: https://donormgt.onrender.com (Render service `donormgt`, auto-deploys on push to `main`)
- Repo: https://github.com/imkumarmrigank/donormgt

## Render

| Setting | Value |
| --- | --- |
| Build command | `npm ci && npm run build` |
| Start command | `npm run migrate && npm start` |

Environment variables (set in the Render dashboard, never in the repo):
`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `CLOUDINARY_URL`, `CLOUDINARY_FOLDER`,
`ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME`, `ADMIN_SETUP_SECRET`, `CORS_ORIGINS`.
See `Backend/.env.example` for what each one does.

On every boot `npm run migrate` applies any new file in `Backend/db/migrations/` once
(tracked in `schema_migrations`). If no admin exists yet, one is created from
`ADMIN_EMAIL`/`ADMIN_PASSWORD`; after that, manage users from User Management.

## Database

`documents` holds every record, one row per document, keyed by
`(collection_path, id)` with the body in `data jsonb` — `donors`, `pickups`,
`pickupPartners`, `payments`, `pickups/<id>/paymentLinks`, `dailyAggregates`, `sksInflows`,
`sksOutflows`, `rstItems`, `sksItems`, `cities`, `sectors`, `societies`, `counters`,
`users`, `systemConfig`. Views named `v_<collection>` (e.g. `v_donors`, `v_pickup_partners`)
show one collection each in the Neon SQL editor.

`src/db/docstore.js` gives the services a Firestore-style API over that table (the app
started on Firestore). Writes go through the `doc_write()` SQL function in one round trip.

`auth_accounts` holds logins: bcrypt password hashes and a `token_version` that signs out
all sessions when bumped (logout, password change, deactivation).

## Files

Uploads are Cloudinary "authenticated" assets under `CLOUDINARY_FOLDER`, readable only
through signed URLs. PDFs are opened through `/api/v1/uploads/view/<token>`, which redirects
to a 10-minute Cloudinary download link (the account blocks PDF delivery from its CDN).

## Passwords

There is no outbound email, so "Forgot password" tells users to ask an admin. Admins set a
new password in User Management → Edit user → Reset Password.

## Local development

```bash
cp Backend/.env.example Backend/.env   # fill in DATABASE_URL etc.
npm --prefix Backend install
npm --prefix Frontend install
npm run migrate
npm run dev:api     # API on :5001
npm run dev:web     # Vite on :5173, proxies /api to :5001
```

Checks: `npm --prefix Backend run check` (syntax) and `npm --prefix Backend run test:docstore`
(document-store behaviour; writes only to `zz_test_*` collections and cleans up).

Seed data (safe to re-run): `npm --prefix Backend run seed:master` (RST/SKS items),
`npm --prefix Backend run seed:locations` (cities, sectors, societies).
