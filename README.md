# MARS Admin Portal

The MARS-side service for **Mars Cosmos** (the POS desktop app): onboard shops, send activation keys, manage licences and devices, and handle owner PIN resets.

- **Server:** Node.js + Fastify + MongoDB Atlas (`server/`)
- **Web:** React + Vite (`web/`)
- **Desktop app:** the separate `mars-pos-desktop` project. It already calls the "app" endpoints below.

Design: [docs/design/admin-portal-design.html](docs/design/admin-portal-design.html) (open in a browser; 13 clickable pages with sample data).

## Run it

```
npm install
copy .env.example .env        (then edit .env)
npm run dev                   server on :4100, web on :5173
npm test                      server tests
npm run typecheck
npm run build
```

Without `MONGODB_URI` the server still starts (only `/health` works). The web app's Dashboard shows whether the server and database are reachable.

### Create the database (MongoDB Atlas)

1. Atlas → **Database Access** → add a database user with `readWrite` on your database. Atlas → **Network Access** → allow your IP.
2. Atlas → **Connect → Drivers** → copy the connection string into `.env` as `MONGODB_URI`. This is a secret: never commit `.env`, never paste it in chat. (Your Atlas *login* password is not used here.)
3. `npm run db:setup` creates the collections with validators and indexes. Safe to run again; it never deletes data.

Database names cannot contain spaces: use `mars_pos`.

## Collections

`shops`, `owners`, `otp_verifications`, `activation_keys`, `devices`, `pin_resets`, `audit_log` (snake_case plurals; document fields are camelCase; every shop record carries `tenantId`). Definitions: `server/src/collections.ts`.
Later: `onboarding_requests`, `licences`, `message_log`, `leads`, `plans`, `subscriptions`, `admin_users`, `sessions`.

## API contract (all answer `501` until built)

| Who calls | Endpoint | Purpose |
|---|---|---|
| desktop app | `POST /v1/activate` | key + mobile + PC id → signed licence and the shop profile |
| desktop app | `POST /v1/refresh` | weekly check: renewed licence, pending PIN hash |
| desktop app | `POST /v1/trial/otp`, `POST /v1/trial/verify` | free trial |
| desktop app | `POST /v1/pin-reset/request`, `GET /v1/pin-reset/status`, `POST /v1/pin-reset/applied` | owner forgot PIN |
| owner web page | `GET /v1/pin-reset/validate`, `POST /v1/pin-reset/complete` | the page the emailed link opens |
| portal | `POST /v1/onboarding/otp`, `/verify`, `/submit` | onboarding form |
| portal | `POST /v1/admin/login`, `GET /v1/admin/shops` | staff sign-in, shops list |

The licence is an Ed25519-signed token (`MARSL1.<payload>.<signature>`); the private key stays on this server, the app holds only the public key. Request and licence formats are in `mars-pos-desktop` → `project-notes/licence/licence.md`.

## Build order (suggested)

1. **Onboarding submit:** OTPs, create shop + owner + activation key; WhatsApp key delivery (WhatsApp Business API, server side).
2. **`/v1/activate` + `/v1/refresh`:** replaces the desktop app's local dev licence server.
3. **PIN reset:** request → email link → web page → hash hand-off to the app.
4. **Portal pages:** Shops, Shop detail, Licences, Keys, Messages, Audit log, Admin users, Plans; staff sign-in.
5. **Database sync / cloud backup** (see the sync notes).

## Security rules to keep

- Passwords and PINs only as hashes; reset tokens and OTPs only as hashes, single use, short expiry.
- Every query filters by `tenantId` in one place.
- Rate-limit OTP and reset requests; same response whether or not an account exists.
- Never log secrets or full mobile/email values; mask them in the portal.
- Keep the licence private key and `.env` out of git.
