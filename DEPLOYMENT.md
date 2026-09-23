# FreePathshala Firebase Setup and Deployment

## 1. Create Firebase Project

1. Open the Firebase Console and create a project.
2. Enable Firestore in production mode.
3. Enable Authentication > Sign-in method > Email/Password.
4. Enable Storage.
5. Install Firebase CLI and login:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
```

## 2. Backend Environment

Create `Backend/.env` from `Backend/.env.example`.

Required values:

```bash
NODE_ENV=production
API_PREFIX=/api/v1
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_WEB_API_KEY=your-web-api-key
FUNCTION_REGION=asia-south1
CORS_ORIGINS=https://your-hosting-domain.web.app
```

For local development, use either `GOOGLE_APPLICATION_CREDENTIALS` pointing to a Firebase Admin SDK service account JSON, or the base64 service-account env var. Never commit service-account files.

## 3. Create First Admin

Create an Email/Password user in Firebase Auth, then set a custom claim from a trusted environment:

```js
await admin.auth().setCustomUserClaims(uid, { role: "admin" })
```

After the user signs in again, the backend will enforce `admin`, `manager`, or `executive` from the ID token.

## 4. Firestore Collections

The backend writes these collections:

- `users`
- `donors`
- `pickupPartners`
- `pickups`
- `pickups/{pickupId}/payments`
- `sksInflows`
- `sksOutflows`
- `cities`
- `sectors`
- `societies`
- `counters`

Location collections grow automatically when donors, pickups, or partners are created/updated with new city, sector, or society values.

## 5. Local Verification

Install dependencies:

```bash
npm --prefix Backend install
npm --prefix Frontend install
```

Run checks:

```bash
npm --prefix Backend run check
npm --prefix Frontend run build
```

Run locally:

```bash
npm --prefix Backend run dev
npm --prefix Frontend run dev
```

Set `Frontend/.env`:

```bash
VITE_API_BASE_URL=http://localhost:5001/api/v1
```

Verify:

1. Login succeeds through `POST /api/v1/auth/login`.
2. Protected API requests include `Authorization: Bearer <idToken>`.
3. Creating donors/pickups writes Firestore documents.
4. New city/sector/society values appear in `cities`, `sectors`, and `societies`.
5. Payment recording creates `pickups/{pickupId}/payments` and updates pickup/partner totals.
6. File uploads request a signed URL, upload directly to Storage, then store the returned URL/path in Firestore.
7. `rg "mockData|schedulerData|USE_MOCK_DATA|../data" Frontend/src` returns no mock-data dependency.

## 6. Deploy

Build the frontend:

```bash
npm --prefix Frontend run build
```

Deploy from the repo root:

```bash
firebase deploy
```

Routing is configured in `firebase.json`:

- `/api/**` goes to the `api` Cloud Function.
- all other routes serve `Frontend/dist/index.html`.

Firestore and Storage rules deny direct client SDK access. The React app must use the backend API for all reads/writes.
