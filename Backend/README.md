# FreePathshala Backend

Express + PostgreSQL (Neon) API for the FreePathshala donor & pickup manager, mounted at
`/api/v1`. In production it also serves the built frontend. Files go to Cloudinary.

Setup, environment variables, and deployment: see [../DEPLOYMENT.md](../DEPLOYMENT.md).

## Authentication

- `POST /api/v1/auth/login` `{ email, password }` → `{ idToken, refreshToken, expiresIn, user }`
- Send `Authorization: Bearer <idToken>` on protected routes; tokens last `ACCESS_TOKEN_TTL_SECONDS`.
- `POST /api/v1/auth/refresh` `{ refreshToken }` issues a new pair.
- `POST /api/v1/auth/logout` signs out every session for the user.

Roles (`admin`, `manager`, `executive`) are read from the user's profile on each request
(cached for a minute), so role changes apply without signing in again.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run migrate` | Apply new `db/migrations/*.sql` |
| `npm run dev` / `npm start` | Run the API |
| `npm run check` | Syntax-check every file |
| `npm run test:docstore` | Test the Postgres document store |
| `npm run create:admin` | Create the first admin from `ADMIN_EMAIL`/`ADMIN_PASSWORD` |
| `npm run seed:master` | Seed RST/SKS item types |
| `npm run seed:locations` | Seed cities, sectors, societies |
