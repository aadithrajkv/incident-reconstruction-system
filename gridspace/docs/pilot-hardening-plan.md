# Invited Chennai pilot hardening plan

## Scope and guardrails

- Target: about 100 invited people in one Chennai neighborhood; no paid SMS and no public production launch.
- Keep the `Product rules` section in `HANDOFF.md` unchanged. Preserve and strengthen existing RLS policies; do not grant client access to trusted profile fields or moderation state.
- The browser preview stays explicitly local-only until shared reads/writes, authentication, and moderation are complete.
- No paid map, email, SMS, payment, or AI provider is selected or enabled without a cost review and approval.

## Ordered implementation

1. Plan: this document.
2. Trusted grid assignment: `supabase/functions/assign-home-grid/index.ts`, `supabase/functions/assign-home-grid/deno.json`, `supabase/functions/assign-home-grid/.npmrc`, `supabase/config.toml`, and the CLI-generated `supabase/migrations/20261121044856_home_grid_assignment_rate_limit.sql`. Authenticate the caller, validate coordinates and accuracy, compute the existing axial hex ID on the server, rate-limit per user, and update only `profiles.home_grid_id`. Do not store or log raw coordinates. This prevents client-supplied grid IDs from authorizing writes; browser GPS remains spoofable and is not proof of physical presence.
3. Sign-in decision: propose an invite-only, no-SMS option and ask before changing authentication. No auth files change until approved.
4. Shared data: after sign-in approval, replace local-only thought, issue, and follow reads/writes in `app.js` with Supabase calls while retaining localStorage only behind the explicit local-preview choice. Update `auth-config.js` and `docs/launch-readiness.md` only as required by the approved path.
5. Safety and moderation: add a CLI-generated reports/moderation migration, a server-authorized moderation function under `supabase/functions/`, and a small moderator-only queue UI. Add report actions to `app.js`.
6. Deletion: add `supabase/functions/delete-account/index.ts` and account/content deletion controls in `app.js`; preserve owner-only delete rules and document retention/deletion behavior.
7. Access tests: add two-user RLS tests under `supabase/tests/database/` for pending issue isolation, grid assignment enforcement, protected moderation fields, and the six-follow cap.
8. Product and launch decisions: reconcile `docs/launch-readiness.md`, `docs/production-architecture.md`, `docs/phone-otp-login.md`, `docs/grid-subscriptions.md`, and `docs/real-data-and-user-stories.md`. Keep the first cohort non-commercial; defer payments and AI inference until separately costed and approved. Keep legal consent/retention wording subject to qualified India privacy counsel.

## Step 2 verification

After implementation, verify the function's JWT handling and input validation, ensure no raw coordinates or service-role secret enter browser files, check that no existing RLS policy was weakened, and report any live behavior that cannot be exercised without a signed-in pilot account.

## Stop points

- Stop for explicit approval before implementing the sign-in choice in Step 3.
- Stop before any paid provider, project upgrade, production change, or public launch.
