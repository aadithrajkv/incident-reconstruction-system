# Fast path to a controlled customer trial

For the next release scope, one-level replies, privacy-safe posting, informal-vendor modes and the return-loop backlog, use [the first release execution blueprint](PRODUCT_EXECUTION_BLUEPRINT.md). Those additions are planned, not delivered by the current local patch.

## Current local deliverable

- India phone OTP welcome screen with prior phone-use notice, resend cooldown, error states and returning-session support.
- Unique pseudonymous username, stable Auth UUID ownership, and a migration path for existing anonymous accounts.
- Shared thoughts and issues plus server-backed business submissions and offers.
- A three-step business flow: public business name/type/pin, offer/hours, then local-business acknowledgement and submission. The listing and initial offer are created atomically, with a maximum of three pending or approved active updates per owner. The server checks that the pin belongs to the assigned grid.
- Pending submissions are visible to their owner and authorized moderators. A moderator can review the pin, message and India-local opening hours, approve, or hide. Approval is manual content review, not proof of business ownership. Owners can remove their listing. Payments, business photo uploads, legal/KYC verification and listing edits are not included.
- Shared feed refreshes manually, on window focus, and every 30 seconds while visible. This is polling, not Supabase Realtime. Account changes invalidate in-flight data responses.
- A frontend-only hosting build; no backend source, invite lists, tests or environment files appear in `dist/`.

All changes are local. Do not treat test success as hosted readiness.

## Deployment sequence

1. Pick staging as the initial target. Configure SMS, CAPTCHA, country restrictions, confirmation and provider spend controls as described in `phone-otp-login.md`. Publish the complete privacy/support information before real customer onboarding.
2. Apply the new database migration. Do not remove the existing migrations or permissively disable RLS. Assign a known human moderator through privileged administration; never grant the role from browser metadata or to the first signup automatically.
3. Deploy the current Edge Functions. The source includes production Thotox origins and loopback ports 8000/8765. Add an exact new Firebase/Vercel staging origin before using it. Browser CORS is not authorization; database and function checks remain required.
4. Run `npm ci && npm test && npm run build`. Deploy only `dist/` with the prepared security headers, keeping preview and customer environments separate.
5. Complete the real-device acceptance checks below. Only then move to a limited invited trial. No hosted deployment or cloud resource creation was performed here.

The Supabase and Vercel connectors are disabled by the workspace administrator. Hosted changes require an authorized deployment path. No admin credential, service-role key, password or OTP should be pasted into chat.

## Two-account acceptance checks

Use two consenting testers with real numbers on staging, plus a separately assigned moderator. Do not use production accounts for destructive tests.

- A verifies an OTP, receives a username, posts a thought in a confirmed grid, signs out and returns with the same number. UUID, username and existing activity must match.
- B opens that grid and sees A's shared thought. B must not edit/delete A's thought or see A's phone/private profile.
- A uploads a pending issue photo. B cannot read the pending issue or its image. A moderator publishes it; B then sees the published issue and its authorized image.
- A registers a business and offer. B cannot see the pending submission. A cannot approve it. A moderator approves it and B sees it after refresh; hiding it removes it for B.
- The owner can remove their listing. Another user cannot remove it. Account deletion removes the Auth identity and owned rows and runs the private-image cleanup path. Check actual Storage cleanup, not just SQL cascading.
- Test wrong/expired OTP, resend throttling, CAPTCHA failure, provider outage, location denial, approximate/manual read-only browsing, boundary uncertainty and session expiry.
- For a legacy anonymous account, link a verified number and confirm that the Auth UUID and activity remain and the old anonymous restore credential cannot transfer the account.

Local PostgreSQL tests cover the corresponding SQL boundaries and data visibility. Real carrier delivery, hosted Auth configuration, Edge Function HTTP behavior and browser layout remain unverified.

## What to postpone

Keep the current plain JavaScript app for this bounded trial. A framework rewrite, moving Postgres off Supabase, automated payments, push notifications and a nationwide launch would lengthen the critical path. Componentize the app after validating the main flows, then use measured bottlenecks to prioritize scaling work. Public OSM tiles/geocoding need an appropriate production arrangement before substantial traffic.

## Trial and revenue experiment

Start in one compact neighborhood with approximately 5 vendors and 30 invited residents. These are suggested experiment sizes, not evidence-backed growth forecasts. Help vendors publish accurate hours and one useful offer, and provide a clearly labeled public QR link to their neighborhood. Do not import residents' contacts or market to the private login numbers.

Keep resident participation free and initial business offers free. Interview returning residents and vendors after two weeks. Measure signup completion, repeated neighborhood visits, approved-offer views, directions clicks and voluntarily reported redemptions; the corresponding analytics instrumentation still needs to be built. Prefer aggregate counts and do not infer purchases from a directions click.

Once vendors can demonstrate value, test an optional merchant subscription for campaign tools or clearly labeled promoted placements. A possible pricing hypothesis is INR 499 per merchant/month, to validate through interviews and an actual willingness-to-pay test. Twenty paying merchants at that price would yield INR 9,980 in gross monthly subscription revenue before SMS, hosting, moderation, support, taxes and payment fees; this is arithmetic, not a forecast. Do not charge for civic issue visibility or sell phone-number access.

Before taking payment, implement cancellation/refunds, server-verified payment webhooks, entitlement checks, sponsored-content labels and honest reporting. The current application does not collect money or provide paid entitlements.
