# Velora application audit

## Architecture reviewed

- Next.js 15 App Router with React 19 and TypeScript. Pages and API routes live under `app/`.
- PostgreSQL with Prisma models/migrations under `prisma/`.
- Custom Node bootstrap and Socket.IO signaling in `server/`; Redis queues and presence in `lib/redis.ts` and `lib/matchmaking.ts`.
- WebRTC is negotiated in the dashboard client; call consent, billing, and ledger settlement are handled server-side.
- Stripe checkout is protected by `paymentsConfig()` and verified webhooks; Stripe is not configured in this local environment.
- Authentication uses hashed passwords, signed session cookies, verification/reset tokens, and a guest-session path.

## Findings and changes in this pass

- The global stylesheet mixed a dark page foundation, large compressed page-specific overrides, and broad table selectors. Added `app/design-system.css` after the legacy stylesheet to unify typography, form fields, cards, wallet, profile, and admin styling while retaining the public landing-page identity.
- The dashboard previously prioritized a large empty call stage over discovery. The existing eligible-user panel now appears before the call room; country matching uses a keyboard-searchable datalist and interest filters are backed by profile interests and Redis queue metadata.
- Discovery previously exposed online profiles without a user visibility control and could include members already in a call. Added persisted `UserProfile.discoverable`, enforced it in availability and matching, filtered busy users and blocks, and added 30-second refreshes.
- The public homepage previously showed only a live count. It now displays actual, verified, discoverable, recently-online profiles from the database and has an honest empty state.
- The profile page lacked visibility, photo upload, and a usable responsive form. It now exposes editable details and discovery visibility while keeping account role and birth date read-only.
- The wallet UI allowed attempts while Stripe was unavailable and omitted payment history. Checkout readiness now comes from the full Stripe configuration check; disabled packages are explicit, and wallet/payment ledgers are shown separately.
- The admin page already had database-backed user, payment, call, moderation, payout, settings, and package operations. Added consistent SaaS styling, actual seven-day database aggregates, navigation anchors for key areas, refund history, and audit-log history.
- Added migration `20261114100000_discovery_visibility` and applied it to the configured local PostgreSQL database.
- The UTC date-only adult check was already corrected; the birthday-boundary test remains green.

## Existing constraints not expanded in this pass

- Matching and billing are deliberately role-specific: verified male accounts initiate paid calls to online female accounts, whose earnings accrue through the existing settlement model. A general Everyone/Men/Women preference cannot be safely added only in the UI without changing recipient eligibility, billing, earnings, and admin reporting together.
- The current profile schema has no language preferences, video-introduction asset, notification preferences, or content-management model. No fake controls or profiles were added for those absent capabilities.
- The admin API supports core user, call, finance, moderation, withdrawal, package, settings, refund, and audit actions. Separate CMS, notification campaigns, refunds administration workflow, and full pagination/date-filter controls are not present in the existing backend.
- Local Stripe checkout remains disabled because valid secret and webhook credentials are absent. No purchase was simulated.

## Verification

- `npm test`: 4 passed, including UTC age boundary and billing math.
- `npm run build`: passed.
- `npx prisma migrate deploy`: applied the discovery visibility migration.
- Production app responds on localhost; dashboard and homepage had no horizontal overflow at 1920, 1440, 1024, 768, and 390 CSS pixels.
