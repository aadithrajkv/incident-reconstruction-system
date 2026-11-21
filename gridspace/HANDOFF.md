# Thotox: handoff notes

Grid-scoped neighborhood contributions: local issues, local business updates, and thoughts. The map and single feed are built with vanilla JavaScript; entry point is `index.html`, application logic is `app.js`, and Supabase client configuration is `auth-config.js`.

## Run it
- Needs a secure context for GPS: `http://localhost` or `https://`.
- `bash start.sh` in this folder (or `python3 -m http.server 8000`), then open http://localhost:8000
- The current app is a browser-local preview. Hosting it does not make data shared or enable phone sign-in.

## Supabase pilot
- Project `thotox-india-pilot` is live in Mumbai (`ap-south-1`), ref `hdtuxjmidzjroeorsvax`, currently $0/month. Do not deploy publicly or configure paid SMS yet.
- Shared core schema and RLS are in `supabase/migrations/`; generated client types are in `supabase/database.types.ts`. The latest migration adds moderated grid issues and a private, size/type-limited image bucket.
- Hosted phone OTP is intentionally disabled. Local fixed-code config is in `supabase/config.toml` (`+1 202-555-0147` / `246810`); the local stack could not start because Docker Desktop ran out of VM disk while extracting images.
- The paused Sydney `thotox` project has explicit deletion authorization but has not been deleted; the connected Supabase Dashboard needs an interactive sign-in to complete that cleanup.

## Product rules (keep these when editing)
- Gated by location (no demo/fake location). Intro: pin slides to top bar, coordinates scramble then settle.
- Header shows the neighbourhood and city using the grid center for reverse geocoding via Nominatim; results are cached per grid, so the exact device coordinates are not sent for naming.
- Opens in **Map** view; the feed is one chronological stream for local issues, local businesses, and thoughts, with alerts behind the bell. The UI uses a monochrome system palette. Map activity shading is optional and counts contributions from the last seven days; it does not represent severity or public sentiment. The home hex pulses gently while the selected hex gets a stronger monochrome outline. Zoom transitions scale the map around the pointer before loading the settled zoom level. Tapping a land hex opens that exact grid’s feed.
- Map pan is clamped to 20 km around the user. Tapping a land hex opens that exact grid’s feed. Hexagon is about 1 km flat-to-flat (Web Mercator, reference
  latitude 20 deg, `RM`). Ids are axial "q,r".
- Nearby hexagons in the 20 km map area can be explored in read-only mode. The list view is scoped to exactly the selected hex; home-grid content is not merged into it. Contributions are limited to the user's current grid in the local preview.
- Local business updates belong to one grid and retain the 30-day schedule preview. The business flow is a prototype; it does not charge or verify ownership. Google Maps search opens as a Maps URL; place selection in Gridspace is a manually placed pin until a restricted Places API key/backend is configured. Directions use a Google Maps URL and need no API key.
  Local businesses and street vendors use separate preview options; business updates are listed only in the current grid.
- Contributions: choose **Raise an issue**, **Local business**, or **Share a thought**. Issues have a category, short note, and optional local-preview photo; the app downsizes and re-encodes that photo to WebP. Activity shading counts contributions from the last 7 days and does not indicate severity. Grid invite links preserve the selected grid. These features currently save to this browser only.
- Thoughts: max 15 active per hexagon. The browser preview grants one seed per day (up to three saved seeds), independent of reactions; a post consumes one seed. At capacity, the next post replaces the oldest thought. Reactions are not shown in the feed. Voice attachments are not implemented. Thought emoji attachments are supported and appear as slow drifting map markers. New grids are empty; there are no sample thoughts or offers. Ad image upload is not implemented; the map renderer can use a secure image URL once a paid upload path exists.
- Grid follows: users can follow up to 6 grids, rename them, and unsubscribe. Subscriptions and contributions are stored only in this browser. Invite links retain the selected grid, but friends do not receive the sender's local data yet. See `docs/launch-readiness.md` and `docs/grid-subscriptions.md` for the production backend/security/scale plan and `docs/real-data-and-user-stories.md` for realistic user flows.
- Phone OTP: a Supabase Auth sign-in flow is implemented in `app.js`; `auth-config.js` has the project URL and publishable key, but hosted phone sign-in remains disabled. The welcome screen offers an explicitly local-only preview continuation. If a fresh location fix stays coarser than 1 km, the user can explore the approximate area read-only while a background watch continues seeking a precise fix. Production SMS needs a configured provider and may cost per message. See `docs/phone-otp-login.md`. Authenticated local preview state is namespaced per Supabase user in this browser, but app content still is not shared or server-authorized.
- Business entry: the phone screen includes a short owner walkthrough. It presents business setup as an optional profile under the same phone account and explicitly separates private verification evidence from the optional public listing image. This is explanatory preview UI; business onboarding and uploads are not yet connected to a backend.
- Production planning: see `docs/production-architecture.md` for the TypeScript/Vite recommendation, Supabase/GCP boundaries, business account design, and staged India pilot. The Mumbai Supabase project is active and schema/RLS are applied. The paused Sydney project remains pending deletion because Dashboard sign-in is required. See `docs/launch-readiness.md` for domain status and production blockers.

## Tiles
- `TILE()` at the top of the script uses OpenStreetMap tiles (no key, light use only). Light tiles are softened; dark mode uses a muted CSS treatment. `landmask.json.gz` is a simplified Natural Earth 1:10m public-domain land layer used to suppress open-water grid centers.
- CARTO basemaps now require an API key. For production use MapTiler, Stadia or Mapbox with your own key.

## Security model (IMPORTANT)
The preview is a static page and currently uses browser-local content, so its client-side location checks are not a security boundary: a browser can fake GPS (devtools sensors)
and user-created data stays on the client. Client-side checks in place: a fresh fix must be <= 1000 m to contribute; a coarser fix can only open a clearly labeled read-only area. Impossible location jumps pause reading for 30 s, and revoking permission reloads the gate.

For real enforcement the server must:
1. Never send a hexagon's thoughts or ads unless the request carries a fresh position inside that hexagon.
2. Compute the hexagon id server-side from the reported lat/lng (do not trust a client-supplied id).
3. Rate-limit and run velocity checks on position history per account/device.
4. Use device attestation in a native app (Play Integrity / Apple App Attest) to detect mock-location apps.
5. Cross-check against IP geolocation and Wi-Fi/cell hints; flag large mismatches.
Even then, determined spoofing can never be made impossible; the aim is to make it costly.

## Next steps
- Shared backend keyed by hex id, real payments (UPI/Razorpay), server-side local-business verification,
  rival-challenge notifications (push/WhatsApp), moderation.

## Media and account features

The local issue preview accepts an optional photo, resizes to 512 px, re-encodes WebP, and keeps it only in this browser. The Supabase issue schema has a separate private media bucket with authenticated grid-scoped Storage policies; it is not yet connected to the UI. Never treat local photo storage as shared or durable.
