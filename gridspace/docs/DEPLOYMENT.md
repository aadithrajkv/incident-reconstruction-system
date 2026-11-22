# GridSpace frontend deployment and pilot priorities

> 2026-11-22 update: the local implementation now uses India mobile OTP and server-backed business review. See [phone login](phone-otp-login.md) and the [current production trial plan](PRODUCTION_TRIAL.md). Older anonymous-preview descriptions below are historical; hosted deployment remains unverified.

Review date: 2026-11-22. The local build is prepared; these changes have not been published.

## Public frontend build

Run `npm run build` from `gridspace`. No third-party build packages are needed. The build creates `dist/` from six explicit application files and PNG/SVG/WebP assets. It excludes invite lists, backend functions, SQL migrations, local environment files, and internal documentation. Supabase remains a separately deployed backend.

The Vercel project root must be `gridspace` when importing the parent repository. `vercel.json` selects no framework, runs `npm run build`, publishes `dist/`, and applies the security headers. `.vercelignore` limits CLI uploads to frontend inputs and the build script. Use the existing `gridspace-preview` project and preview domain; do not change the root Thotox deployment. Inspect project-level overrides before publishing. A preview-domain response is not proof that the current local revision has been deployed.

The existing preview domain returned HTTP 200 with a Vercel server header on the review date. Its served CSP still lacks the Turnstile origin; the local configuration fixes that. The Vercel plugin directory reports the provider disabled by the workspace administrator, and no usable workspace connection was returned, so deployment through that plugin is currently unavailable.

## What the UI update changes

The welcome illustration now gets about 62% of wide-screen width and a viewport-height sticky scene. On phones it gets a larger 300–520 px section. The form is integrated into its side panel. Business and feed illustrations retain their natural landscape proportions rather than the old 176–194 px height caps. The issue example is full width. These changes have not been visually checked because browser control is unavailable.

The business welcome button no longer calls the removed phone-auth configuration function. The local business wizard has a local-business confirmation checkbox, isolated business-type buttons, and saves preview updates to local storage. Shared business publishing remains disabled and is not implemented by these fixes.

## Recommended GCP path

Start with Firebase Hosting for the frontend and keep the existing Supabase auth, Postgres, storage, RLS and Edge Functions. This gets the application frontend onto Google infrastructure without a database migration. Add Cloud Run only for a concrete server workload. A move of the entire backend to GCP is a separate migration requiring replacements for auth, RLS, storage policies and functions.

Before cloud changes, select a dedicated project and region, establish the billing owner and budget, and authenticate through the provider's normal login. Do not share service-account JSON keys or passwords in chat. Grant only the project-scoped deployment permissions needed by the selected hosting setup. Budget alerts are notifications, not a hard spending cap. Configure staging independently of the customer environment. `firebase.json` is prepared to serve `dist/` with the same security headers. Firebase does not read Vercel headers automatically. Once a project has been selected and normal Firebase CLI login completed, deployment uses `firebase deploy --only hosting --project PROJECT_ID`; the project must first have Firebase Hosting initialized and any billing requirements resolved. No GCP resources have been created or deployed in this change.

## Trial priorities, in order

1. Verify two real invited accounts through signup/CAPTCHA, grid assignment, shared thoughts, private photos, moderation, restore-key replay rejection and account deletion. Assign a moderator. Anonymous Auth settings and the empty Turnstile site key need attention; local code alone does not establish hosted configuration.
2. Finish server-backed business profiles and offers before promising advertiser functionality: ownership, moderation, schedule/expiry, separate private verification and public listing media, and a second account seeing the approved offer. Keep offers free during the first trial; paid publishing needs server-verified payment webhooks.
3. Complete device UX: real iOS/Android location permission flows, approximate/denied location, slow/offline behavior, welcome sizing, keyboard access, install/update behavior, and clear errors. Consider recoverable login alternatives to a restore-key-only account.
4. Prepare operations: user-facing privacy information and support contact, moderation ownership, backup/restore verification, error monitoring, rate limits, and a map/geocoding provider appropriate to expected traffic. Do not assume the public OSM tile endpoint has a production SLA.
5. Run one compact neighborhood trial with a small resident/vendor cohort. Measure successful signup, first useful contribution, approved offer visibility, repeat use and reported problems. Check backend latency, database query patterns and costs before broad paid acquisition.

A React/TypeScript migration can improve maintainability as flows grow, but changing frontend frameworks or cloud providers does not by itself make authorization, business publishing or operations ready.

## macOS location failures

Apple's `CLError.locationUnknown` means the provider could not obtain a location at that time; it is distinct from permission denial. macOS uses nearby Wi-Fi information for location. Check system Location Services for the browser, per-site location permission, and Wi-Fi. Testing the current-location action in Apple Maps helps distinguish a wider device/provider problem from this application's browser path. HTTPS hosting cannot repair a device-level Core Location failure.

The application now keeps its acquisition watch alive through temporary provider errors for the full 25-second window, then tries one 12-second lower-accuracy request. The old code cancelled the watch at the first provider error or at a shorter 15-second UI deadline. The fallback accepts device results no older than one minute. Superseded callbacks are ignored, invalid coordinate data is rejected, and permission revocation pauses sharing and clears pending grid assignment. Existing approximate/saved-area browsing remains read-only; no IP-derived or manually invented position is used. Mac troubleshooting guidance is available in the location screen. These changes do not guarantee that an OS provider can obtain a position.

Run `npm run test:location` for nine simulated acquisition/tracking regression cases. A real-device browser check is still required. For the product roadmap, consider an explicitly chosen neighborhood for read-only discovery and a consent-based phone-to-desktop location handoff; neither is implemented by this patch.

References: [Apple locationUnknown](https://developer.apple.com/documentation/corelocation/clerror-swift.struct/code/locationunknown), [Mac Location Services](https://support.apple.com/en-ie/guide/mac-help/mh35873/27/mac/27), [W3C Geolocation](https://www.w3.org/TR/geolocation/).
