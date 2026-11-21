# Thotox pilot launch readiness

## Product pass in this workspace

- Contributions are grouped by the grid and labeled **Local issue**, **Local business**, or **Thought**.
- Issues accept a category, short note, and optional photo. The preview resizes and re-encodes photos to a small WebP image, which strips embedded camera metadata.
- Business updates are limited to one grid; the preview does not collect payment or claim that a business has been verified.
- The map has an optional activity shading layer. It counts recent contributions over seven days and does not represent severity or resident sentiment.
- Grid invites use a share link containing the selected grid ID. It opens that grid only when it is within the visitor's current 20 km map range.

## Backend security prepared

- Mumbai Supabase project: `hdtuxjmidzjroeorsvax` (`ap-south-1`), quoted at $0/month before creation.
- `grid_issues` has RLS enabled. New reports are `pending_review`; only the owner can read them until a moderator publishes them. Inserts must match the caller's server-held home-grid value.
- Issue photos use a private bucket capped at 2 MiB and JPEG/PNG/WebP. Storage policies restrict uploads to the authenticated user and their current grid; a photo is readable only by its owner or when its issue is published.
- The frontend contains only the Supabase publishable key. No service-role or SMS provider secret is in the repo.
- Security response headers are prepared in `vercel.json`. The inline app script was moved to `app.js` so the script CSP can disallow inline scripts.

## Invited pilot implementation status

- Supabase Anonymous Auth is invite-gated by one-use codes. The database stores invite digests only and blocks shared-table access until redemption.
- Accurate device location is sent only to the `assign-home-grid` Edge Function; the server recomputes the grid and stores only the grid ID.
- Invited users read/write shared thoughts, issue reports, and followed grids. Thought seeds and the 15-active-thought cap are enforced in Postgres. Issues are private to their author until moderation publishes them.
- Authenticated contribution data is loaded from Supabase, not retained in browser storage. The explicit local-preview path stays browser-only.
- Local business/offer setup, realtime updates and push notifications remain unconnected. The browser cannot currently provide moderation, account deletion, or content reporting.

## Not ready for public traffic

The pilot is not ready for public or general invited use yet. Supabase Anonymous Auth and CAPTCHA still need to be enabled in project settings; no recovery method exists for anonymous accounts. Moderation UI, reports, account deletion, and two-user RLS tests are still outstanding. The local business/offer flow remains a browser prototype. Invite only a supervised cohort after these items are complete and the shared flows pass authenticated RLS verification.

Before public launch:

1. Enable Anonymous Auth and CAPTCHA in Supabase settings; decide how users will recover accounts before using the pilot beyond a supervised test.
2. Add report/user rate limits, abuse reporting, moderation and resolution workflow, and photo deletion/retention.
3. Add an accessible privacy notice and consent for public issue images; never expose exact device coordinates.
4. Add account deletion and content ownership controls; test each RLS rule using separate accounts.
5. Confirm that a human moderator can publish a report and that another authenticated user sees only published issues and their authorized image.
6. Complete a privacy review and staged deployment check before promoting beyond the preview domain.

## Domain and hosting status checked 2026-11-19

- `preview.thotox.com` is attached to the isolated Vercel project `gridspace-preview`; the current staged deployment returned HTTP 200 over HTTPS after the deployment was corrected.
- This is a browser-only product preview. Hosted phone OTP is disabled, contributions remain in local browser storage, and no real user can see another visitor's activity.
- The root Thotox production project was not changed. Keep this subdomain labeled as a preview until shared auth/data, moderation, and the business image/payment paths are implemented and verified.
