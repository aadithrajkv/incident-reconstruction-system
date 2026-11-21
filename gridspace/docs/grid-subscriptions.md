# Grid subscriptions: preview and production plan

## What works in the prototype

- Follow or unfollow a grid from its feed, up to six grids.
- Give each followed grid a personal label such as “Chennai” or “Home”.
- Open Alerts, name or remove saved grids, and open an existing update if one is present.
- See followed grids marked subtly on the map.

This is a browser-only preview. Subscriptions and user-entered posts/offers are stored in local storage on this device. New grids are empty. There is no shared event source, so the app cannot receive updates from another person or send browser/mobile notifications. The preview states this in Alerts. See [real data and user stories](real-data-and-user-stories.md) for the honest current behavior and pilot flows.

When a shared event source exists, browser delivery while the app is open/backgrounded can use the Notifications API. Delivery after the page is closed requires Web Push with a service worker, a VAPID key, and a trusted server to send push messages. Mobile web can use Web Push in supported installed web apps; a native mobile app would use FCM/APNs. Neither push sender is configured in this static preview. References: <https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API>, <https://firebase.google.com/docs/cloud-messaging/web/receive-messages>, <https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/>.

## Smallest sensible production shape

Start with Supabase Auth + Postgres + Realtime for the first shared beta. It already combines the account, durable state, and live channel pieces needed here. Keep Google Cloud out of the first beta; adding a second cloud before there is meaningful traffic would add credentials, operations, and billing without improving this in-app flow.

Suggested durable tables:

- `grid_subscriptions(user_id, grid_id, label, last_seen_at, created_at)`, unique on `(user_id, grid_id)`. Enforce the six-grid beta cap in a database function or server route as well as in the UI.
- `grid_events(id, grid_id, actor_id, kind, entity_id, created_at)`, one compact row per accepted new thought or offer event. Do not copy each event into one notification row per follower.

Use a database trigger to publish only the event ID, grid ID, and event kind to a private Realtime Broadcast topic such as `grid:<id>`. The app then reads the event through an authenticated query governed by row-level security. On reconnect, fetch events after `last_seen_at`; this recovers missed updates without polling the entire feed. Exclude the author’s own event from their unread count. Keep payloads small and do not send exact user coordinates through the notification channel.

RLS should restrict subscription reads, edits, and deletes to `auth.uid() = user_id`. Private channel authorization must verify the signed-in account has a subscription to the requested grid. Event reads must follow the product’s grid visibility rules. Never ship a service-role key to the browser. Add rate limits and moderation before opening anonymous posting broadly.

Supabase recommends Broadcast for scalable and secure database change notifications; Postgres Changes is simpler but does not scale as well. Private channel authorization and RLS are required parts of that design: <https://supabase.com/docs/guides/realtime/subscribing-to-database-changes>.

## When to add GCP

Add Google Cloud only when a specific need appears:

- Cloud Run for a small trusted API/outbox worker if database triggers become insufficient or you need server-side event processing.
- Firebase Cloud Messaging (and a service worker / device token lifecycle) only when users need notifications while the app is closed. In-app Realtime is enough for the first beta.
- Cloud Logging/Monitoring when there is a real production service to operate.

Keep Supabase as the source of truth unless measured limits or a clear compliance/operational requirement justify a move. Avoid duplicating the same event store in two clouds. Track active sockets, messages per second, writes, retained rows, and reconnect catch-up volume before making capacity or cost promises.

## Domain and product direction

Keep the opening experience map-first and thought-first. Put business onboarding behind a calm “For local businesses” entry; keep paid offers labeled in the shared feed. Treat government or farmer alerts as a later verified-publisher feature with separate trust and delivery rules, not as ordinary community thoughts.

GoDaddy DNS can point `thotox.com` at the hosting endpoint, but DNS alone does not route `/gridspace`. The hosting layer must serve or rewrite that path. Google Cloud URL maps support path-based rules if a Google load balancer is chosen: <https://docs.cloud.google.com/load-balancing/docs/url-map>. A simpler first deployment can use a host-level rewrite on the selected static host. Keep `/gridspace/*` assets and navigation paths relative or base-aware so a nested deployment works.

The visual cue can borrow the idea of a programmable laptop status display without turning the whole map into cyberpunk: keep the base map monochrome, use a quiet dotted outline for followed grids, a restrained light halo only when a followed grid has unread activity, and slow, expanding hex rings around the user’s grid. That communicates a live signal while preserving the familiar map and feed.
