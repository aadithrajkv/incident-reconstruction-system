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

## Not ready for public traffic

The static preview still saves thoughts, issues, business updates, and follows in browser storage. The live Supabase tables are not yet connected to those screens. Hosted phone Auth is disabled, fixed-code local Auth has not run because Docker Desktop storage is constrained, and there is no server-side home-grid assignment endpoint or moderation console. Thus the current UI is a single-browser prototype; publishing it as the public civic service would falsely imply that reports are shared and would bypass the intended moderation/data path.

Before public launch:

1. Enable a real sign-in path, then wire reads/writes to Supabase and test each RLS rule using separate accounts.
2. Set a trusted grid assignment action, report/user rate limits, abuse reporting, moderation and resolution workflow, and photo deletion/retention.
3. Add an accessible privacy notice and consent for public issue images; never expose exact device coordinates.
4. Decide the hosting account and publish a reviewed preview. Then attach the domain and verify HTTPS before promotion.
5. Confirm that a human moderator can publish a report and that another authenticated user sees only published issues and their authorized image.

## Domain and hosting status checked 2026-11-19

- `preview.thotox.com` is attached to the isolated Vercel project `gridspace-preview`; the current staged deployment returned HTTP 200 over HTTPS after the deployment was corrected.
- This is a browser-only product preview. Hosted phone OTP is disabled, contributions remain in local browser storage, and no real user can see another visitor's activity.
- The root Thotox production project was not changed. Keep this subdomain labeled as a preview until shared auth/data, moderation, and the business image/payment paths are implemented and verified.
