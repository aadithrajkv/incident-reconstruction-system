# Phone OTP login

## Current implementation

The app now has a mobile-first phone number and six-digit code flow backed by Supabase Auth. After successful verification, the app requests location access. Signed-in users can sign out from the header. Phone numbers are sent to Supabase Auth and are not copied into Thotox's local app state or shown on posts.

The login screen also has a short “I run a local business” walkthrough. It uses the same phone account and makes clear that business verification evidence and a public listing image are separate. The walkthrough does not register a business or upload files yet.

The Mumbai pilot project (`hdtuxjmidzjroeorsvax`) is connected in `auth-config.js`, but hosted Phone Auth is deliberately disabled until a no-cost test path is available without configuring paid SMS. Until then, the login screen offers an explicitly labeled **local preview** continuation. That path is not authentication and must not be used as a public launch gate. Core shared-data schema and RLS are prepared, but the current app still uses browser-local content.

## $0 development testing

Supabase Auth can use fixed test phone numbers and codes so verification of those numbers does not send an SMS. Supabase currently requires Phone Auth and an SMS provider to be configured even when using a test number. To honor the no-paid-SMS constraint, the repo has a local Supabase config with a reserved fictional test number (`+1 202-555-0147`) and code `246810`; no real provider credentials are present. The local stack did not start because Docker ran out of disk space while extracting images. Free space in Docker Desktop, then run `npx supabase start` and test that number/code against the local Auth URL. Do not enter the test number in the hosted project. Keep test numbers out of production configuration and remove them before launch.

## Production SMS costs and requirements

There is no free, general-purpose production SMS OTP guarantee. Supabase Auth does not supply free SMS delivery; it connects to a provider such as Twilio, Vonage, or MessageBird. The provider charges for delivered messages and rates vary by destination, sender route, and provider. Firebase also requires a billing account for real phone SMS verification; its no-cost testing mode is for simulated/test flows. Supabase Auth's free MAU allowance does not pay the SMS carrier bill.

For an India-only pilot, keep country codes restricted to `+91` in the production UI, configure the SMS provider's India route, and confirm sender/template registration and delivery requirements (including TRAI DLT where applicable) before inviting users. Exact per-message rates should be checked in the chosen provider's current India pricing and account console; they can change. Add CAPTCHA, server-side per-number/IP rate limits, spend alerts, and a maximum daily send budget to limit SMS abuse. The 60-second resend timer in this page is a user-experience control, not a security boundary; enforce limits at Auth/provider level too.

SMS OTP verifies temporary control of a phone number, not a permanent real-world identity. Phone numbers can be reassigned and SMS accounts can be hijacked. Do not use phone verification alone to award trusted-publisher status, seller verification, or access to high-impact paid actions. Provide a way to recover an account after a number change and be clear about what happens to existing posts if the number is recycled.

## Setup checklist

1. The Mumbai Supabase project has been created and the shared schema/RLS are applied.
2. For local fixed-code testing, free space in Docker Desktop and start the repo's local Supabase stack. The test phone/code are documented above.
3. Hosted Phone Auth remains off. Before real delivery, choose and configure a paid SMS provider; never put provider or `service_role` credentials in browser config.
4. Add the local and production origins to Supabase Auth's allowed redirect/site URLs. Keep production on HTTPS.
5. Set provider rate limits and CAPTCHA before public access. For India delivery, complete applicable sender/template registration and test delivery on multiple carriers.
6. Verify request, wrong-code, resend cooldown, sign-out, and returning-session flows. OTP authentication alone does not provide account recovery if a user loses access to their phone number; document a support/recovery policy.
7. Before using login as a real product gate, connect posts and follows to a shared database with per-user authorization. A phone-verified session plus localStorage does not make content shared or enforce permissions.

## References

- [Supabase phone sign-in](https://supabase.com/docs/guides/auth/phone-login)
- [Supabase test phone numbers](https://supabase.com/docs/guides/auth/testing-auth-flows#test-phone-sign-in-with-test-numbers)
- [Supabase pricing](https://supabase.com/pricing)
- [Firebase phone authentication FAQ](https://firebase.google.com/docs/auth/faq-and-troubleshooting)
