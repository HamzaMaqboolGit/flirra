# Velora — random video chat

Velora is an adult-only, one-to-one video chat application. It uses a Next.js App Router frontend, a custom Socket.IO server, PostgreSQL/Prisma for accounts, coordination and the financial ledger, and browser WebRTC for calls.

## Local development

Requirements: Node.js 20.19+ (Node 22 LTS recommended), npm, Docker Desktop or local PostgreSQL 15+.

```sh
npm install
cp .env.example .env
# Set DATABASE_URL, AUTH_SECRET, ADMIN_EMAIL, and ADMIN_PASSWORD in .env.
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The custom server needs one HTTP port for Next and Socket.IO. If port 3000 is already used, choose an available port, for example `PORT=3100 APP_URL=http://localhost:3100 npm run dev`. Keep `APP_URL` aligned with the browser origin for Socket.IO CORS and email links. Camera/microphone access requires localhost or HTTPS.

The server creates the first administrator only when `ADMIN_EMAIL` and a strong `ADMIN_PASSWORD` (14 or more characters) are set. Sign in at `/login`; the admin console is `/admin`. Keep `.env` private. The demo email adapter logs development links to the server console and returns them in local API responses; production must configure Resend and set `ALLOW_DEV_EMAIL_LINKS=false`.

## Implemented journeys

- Email/password registration with 18+ and terms acknowledgement, email verification, login/logout, reset/resend verification, secure database sessions, profile editing, image upload, and account deletion with retained financial audit history.
- Male matching queue, country filter, online female discovery, direct call requests, consent/reject, skip, busy locks, repeat-pair avoidance, disconnect cleanup, and Socket.IO presence/call events.
- One-to-one peer WebRTC with camera/microphone toggles, end/skip controls, connection status, timer, safety reporting/blocking, and STUN. Configure TURN for networks that cannot connect peer-to-peer.
- Server-side minute billing after both accepted users report a connected WebRTC peer, with atomic balance debit, immutable transaction records, creator 70% / company 30% split by default, pending earnings, and settlement on call end.
- Admin dashboard: user status/disconnect, moderation, call termination, financial summaries, coin package management, pricing/revenue settings, payouts review, payment history, and audit logs.
- Stripe Checkout/webhooks, Stripe Connect onboarding/payout hooks, identity-status handling, and withdrawal state transitions are implemented behind feature flags. These remain disabled by default.

## Provider setup and limits

Set `PAYMENTS_ENABLED=true`, Stripe test keys, and `STRIPE_WEBHOOK_SECRET` to test coin checkout with a Stripe test account and a webhook forwarder to `/api/stripe/webhook`. Live charges additionally require `PAYMENTS_LIVE=true` after business approval. The admin controls packages, per-minute price, revenue share, credit conversion, and minimum withdrawal.

Stripe Connect onboarding requires approved Connect capabilities, `STRIPE_CONNECT_ENABLED=true`, and `STRIPE_SECRET_KEY`; live Connect additionally requires `STRIPE_CONNECT_LIVE=true`. Actual withdrawals also require `PAYOUTS_ENABLED=true`, a connected/verified account, and correctly configured Stripe account/webhook events. No real funds should be handled until the entity, country coverage, identity/age checks, tax obligations, policies, Stripe platform, and payout flows receive business/legal/provider approval. When disabled, checkout and withdrawal APIs return an explicit unavailable response and do not change balances.

Configure `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL` for TURN. These static credentials are suitable for local validation only; production should use short-lived TURN credentials from a managed TURN service. STUN-only WebRTC cannot connect every NAT/firewall combination. The app uses direct peer media and does not record video. Production deployment also needs HTTPS, durable PostgreSQL, backups, monitoring, secure secret management, and a review of age/identity verification requirements for its operating markets.

## Database and deployment

`prisma/migrations` contains committed PostgreSQL migrations. Deploy with:

```sh
npm run db:generate
npx prisma migrate deploy
npm run build
npm start
```

`docker-compose.yml` provides PostgreSQL for local development. Coordination state is persisted in PostgreSQL. Run one custom-server instance per deployment unless PostgreSQL-backed event fan-out is configured.

## Checks

```sh
npm test
npx prisma validate
npx tsc --noEmit
npm run build
```

The committed unit suite covers age, per-minute pricing, creator/company splits, and payout conversion. Browser WebRTC, Stripe, and payout integrations still require local test users, camera/network combinations, and Stripe test credentials/webhook forwarding.
