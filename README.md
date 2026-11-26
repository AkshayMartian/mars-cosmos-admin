# MARS Admin Portal

The MARS-side service for **Mars Cosmos** (the POS desktop app): onboard shops, send activation keys, manage licences and devices, and handle owner PIN resets.

- **Server:** Node.js + Fastify + MongoDB Atlas (`server/`)
- **Web:** React + Vite (`web/`)
- **Desktop app:** the separate `mars-pos-desktop` project. It already calls the "app" endpoints below.

Design: the earlier 13-page version is in [docs/design/admin-portal-design.html](docs/design/admin-portal-design.html); the web app now follows the newer "MARS Admin Portal" prototype.

## Run it

```
npm install
copy .env.example .env        (then edit .env)
npm run dev                   server on :4100, web on :5173
npm test                      server tests
npm run typecheck
npm run build
```

**What the web app has today:** the prototype design (dark top bar, left menu, rust accent), built in `web/src/pages/`: sign-in, Dashboard, Shops (filters, search), Shop detail (Overview, Licence, Devices, Activation key, Add-ons, WhatsApp, Notes), Plans & add-ons, WhatsApp (templates, log), App releases, Payments, Team, Audit log, and the public owner PIN-reset page at `/reset-pin`. **Onboard a shop is real** (talks to the server, see below). Every other page shows **sample data** kept in the browser (`web/src/store.ts`, marked "Sample data"); sign-in is a placeholder (any listed team email). Each page swaps its sample data for an API call as its endpoint is built.

Without `MONGODB_URI` the server still starts (only `/health` works). The web app's Dashboard shows whether the server and database are reachable.

### Create the database (MongoDB Atlas)

1. Atlas → **Database Access** → add a database user with `readWrite` on your database. Atlas → **Network Access** → allow your IP.
2. Atlas → **Connect → Drivers** → copy the connection string into `.env` as `MONGODB_URI`. This is a secret: never commit `.env`, never paste it in chat. (Your Atlas *login* password is not used here.)
3. `npm run db:setup` creates the collections with validators and indexes. Safe to run again; it never deletes data.

Database names cannot contain spaces: use `mars_pos`.

## Collections

`shops`, `owners`, `otp_verifications`, `activation_keys`, `devices`, `pin_resets`, `audit_log` (snake_case plurals; document fields are camelCase; every shop record carries `tenantId`). Definitions: `server/src/collections.ts`.
Later: `onboarding_requests`, `licences`, `message_log`, `leads`, `plans`, `subscriptions`, `admin_users`, `sessions`.

## Built: onboarding and activation

1. **Onboard a shop** (`/onboard` page → `POST /v1/onboarding/otp`, `/verify`, `/submit`): owner name, photo, mobile, email, password, then shop name, description, contact, GST, address, state, city, pincode. A 6-digit code (valid 10 min, 5 tries, hashed in the database) must verify the mobile (sent on WhatsApp) and the email. Submit saves `shops`, `owners` (scrypt password hash, photo in `UPLOAD_DIR`) and an `activation_keys` row, then sends `MARS-XXXX-XXXX-XXXX` to the owner's WhatsApp. If WhatsApp fails the shop is still saved and the portal shows the key.
2. **`POST /v1/activate`** `{key, mobile, machine}` → `{licence, shop, owner}`: checks key + mobile, binds the key to the PC (same PC may re-activate; another PC gets 409), marks the shop active and returns the Ed25519-signed `MARSL1.…` licence plus the shop profile (name, description, contact, GST, address) and owner (name, mobile, photo). The email is never returned.

Setup: `npm run licence:keygen -w server -- licence-private.pem` (put the printed public key in the desktop app, set `LICENCE_PRIVATE_KEY_FILE`), `OTP_SECRET`, and `npm run db:setup` (validators changed). `MESSENGER=console` prints codes and keys in the server log for development; `MESSENGER=live` needs the WhatsApp and SMTP values in `.env.example`.

**Staff sign-in:** `POST /v1/admin/login` checks `admin_users` (scrypt hash, 5 wrong passwords lock the account for 15 minutes) and sets a signed, httpOnly session cookie (8 hours); `GET /v1/admin/me`, `POST /v1/admin/logout`. All `/v1/onboarding/*` calls need it. Create staff with `ADMIN_PASSWORD=... npm run admin:create -w server -- <email> <name> <Admin|Support|Sales>`. The mobile code second step is not built yet.

## API contract (the rest answer `501` until built)

| Who calls | Endpoint | Purpose |
|---|---|---|
| desktop app | `POST /v1/refresh` | weekly check: renewed licence, pending PIN hash |
| desktop app | `POST /v1/trial/otp`, `POST /v1/trial/verify` | free trial |
| desktop app | `POST /v1/pin-reset/request`, `GET /v1/pin-reset/status`, `POST /v1/pin-reset/applied` | owner forgot PIN |
| owner web page | `GET /v1/pin-reset/validate`, `POST /v1/pin-reset/complete` | the page the emailed link opens (`/reset-pin?token=...`, address from `WEB_URL`) |
| portal | `POST /v1/admin/login`, `GET /v1/admin/dashboard`, `GET /v1/admin/shops` | staff sign-in, dashboard figures, shops list (built) |

The licence is an Ed25519-signed token (`MARSL1.<payload>.<signature>`); the private key stays on this server, the app holds only the public key. Request and licence formats are in `mars-pos-desktop` → `project-notes/licence/licence.md`.

## Build order (suggested)

1. ~~Onboarding submit~~ (done).
2. **`/v1/refresh`** (`/v1/activate` is done): replaces the desktop app's local dev licence server.
3. **PIN reset:** request → email link → web page → hash hand-off to the app.
4. **Portal pages:** Shops, Shop detail, Licences, Keys, Messages, Audit log, Admin users, Plans; staff sign-in.
5. **Database sync / cloud backup** (see the sync notes).

## Security rules to keep

- Passwords and PINs only as hashes; reset tokens and OTPs only as hashes, single use, short expiry.
- Every query filters by `tenantId` in one place.
- Rate-limit OTP and reset requests; same response whether or not an account exists.
- Never log secrets or full mobile/email values; mask them in the portal.
- Keep the licence private key and `.env` out of git.
