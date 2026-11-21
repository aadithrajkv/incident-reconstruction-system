# Real data and user stories

## What a person sees today

The map uses OpenStreetMap tiles and a Natural Earth land mask. The thoughts, local offers, reactions, subscriptions, and alerts do not come from real users or a shared service. New grids are empty. Anything someone creates in this preview is saved only in that browser's local storage, so another person or device cannot see it. Posting and offers are demonstrations; payments and real notifications are not connected.

There is no real user dataset available in this project. We should not fill the feed with invented names or pretend example posts are authentic. The empty state is the truthful experience until a shared backend and consented pilot content exist.

## User story: follow two places

**Maya works in Chennai and visits her family in Madurai.** She opens the map, follows her Chennai grid and her family’s grid, and gives them labels she recognizes. After a neighbor posts a thought in Madurai, a shared version of the app records that event and Maya sees one update under Alerts. She taps it and lands on that exact grid. She can read its feed while she is away; location can still govern where she is allowed to post.

**Acceptance criteria for a real release:** subscriptions belong to Maya’s signed-in account and sync across devices; only accepted posts produce events; the event contains no precise location or thought text; reopening the app retrieves updates missed while offline; browser or mobile push is offered only after the corresponding push service is configured and the user opts in.

**What happens in this preview:** Maya can save and name grids locally, but nobody else can post into them and no update can arrive. The app now says that explicitly.

## User story: a neighborhood tea stall

**Ravi runs a tea cart near a Chennai bus stop from 6:30–10:00 p.m.** He selects his stall, places a pin where customers can find him, writes “Ginger tea and snacks until 10,” and chooses the nearby grids where the offer should appear. A passerby opens one of those grids, sees the offer only during its hours, and taps Directions to open a map route.

**Acceptance criteria for a real release:** Ravi controls the listing and its schedule; the pin is accurate enough to find the stall without exposing his home location; payment succeeds before a paid offer is published; expiry and cancellation are enforced by the server; edits and reports are auditable; the public listing does not reveal the owner’s private account details.

**What happens in this preview:** Ravi can save an offer locally for interaction testing. It is not paid for, verified, or visible to nearby users on another device. Google Maps search and directions are links; place discovery is not integrated.

## What would make the data real

Run a small, opt-in neighborhood pilot. Invite residents and independent vendors, explain what is public, collect posts from those participants, and label launch content with its source and date. Store accounts, posts, listings, subscriptions, and events in a shared backend with access rules and moderation. Do not seed the product with scraped personal posts or fabricated testimonials. Public map tiles are suitable geographic context, not a source of neighborhood thoughts or offers.

## If launching to one area this week

An experienced product designer would frame this as a **small, staffed pilot**, not a citywide launch. Pick one compact neighborhood where the team can talk to participants directly. Keep the promise narrow: “See what your neighborhood is thinking, and share one thought.” Keep offers secondary until the thought feed feels useful.

### Week-one sequence

1. **Choose one pilot area.** Pick one neighborhood with a clear boundary and enough reachable residents for direct feedback. Start with one language and a small group of invited participants. Do not open every grid across a city before there is moderation coverage.
2. **Make the first session obvious.** On opening, show the nearby grid, its name, and whether it has posts. Explain in one sentence what is public and how to post. If the grid is empty, invite the first thought instead of showing sample activity.
3. **Test the core loop in person.** Ask a few people to open the map, read a thought, write one, and follow a second grid. Watch where they hesitate. Verify that “Unfollow” removes the grid and that the user understands no notification can arrive until shared updates are live.
4. **Operate the pilot manually.** Have a named person review reports, answer support questions, and pause harmful content. Provide report and delete controls before inviting people beyond a small trusted cohort. Keep a simple incident log.
5. **Measure usefulness before growth.** Track first thought read, first thought posted, return visits, follows, unfollows, reports, and time to moderation. Ask participants whether a thought felt local and timely. Do not optimize for post volume alone.
6. **Decide after the week.** Expand only if people understand the privacy model, return without reminders, and moderation can keep up. If not, improve onboarding and the neighborhood boundary before adding features or paid offers.

### Launch gate

This repository is still a browser-only prototype. A public pilot with real participants needs at minimum: a shared backend and accounts (or a clearly bounded invite-only identity model), server-side access rules, user deletion and reporting, moderation ownership, privacy/retention language, basic abuse controls, error monitoring, and a verified hosting setup. A map-only local preview can be shown this week; advertising payments, push notifications, and claims of real-time community activity should wait until those flows have been implemented and verified. 
