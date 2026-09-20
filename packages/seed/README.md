# @openpanel/seed

Deterministic seed data for a worktree: one login, one organization, four projects
with realistic traffic in ClickHouse. `bun run seed` from the repo root.

```
bun run seed                       # small: 14 days, ~5k sessions
bun run seed --size large --reset  # 90 days, ~1M sessions; --reset clears earlier seeded rows
bun run seed --days 3 --sessions-per-day 500 --projects saas,app --seed 7
bun run seed --dry-run             # the plan only
```

Same flags + seed ⇒ identical rows.

`bun run send` sends *live* requests to `$API_URL` with the seeded clients — through the real
ingest pipeline, unlike the seed's direct inserts:

```
bun run send journey --project acme-shop --sessions 2       # generate a journey with the archetype, replay it
bun run send track purchase --project acme-shop --path /order/1 --prop value=99 --revenue 99
bun run send identify usr_123 --project acme-saas --email a@b.co --prop plan=pro
``` Output: `.seed.json` at the repo root (login,
ids, client secrets, the product's MCP endpoint with a root-client token, and the funnels
below), for agents and the e2e suite.

## What the data is built to show

| Project | Identity | Funnels (breakdowns) | Cohort-worthy behaviours |
|---|---|---|---|
| **Acme Web** `acme-web` (website) | Anonymous; a device is new every UTC day (ingest's salted id). ~18 % sign up and are identified from then on. | Signup: `screen_view → plan_selected → signup_started → signup_completed` (referrer, device, country, plan). Demo: `cta_clicked → demo_requested` | signed up, requested demo, subscribed to newsletter |
| **Acme SaaS** `acme-saas` (logged-in product) | Everyone signs up/logs in on the first session ⇒ real retention. | Activation: `signup_completed → project_created → sdk_installed → first_event_received` (signup_source, company_size, role, sdk). Upgrade: `pricing_viewed → checkout_started → subscription_started` (plan, interval) | invited a teammate, exported, connected an integration, paid plan, churned — each changes retention |
| **Acme Shop** `acme-shop` (ecommerce) | Anonymous shoppers; ~40 % of buyers create an account at first purchase. | Checkout: `product_viewed → add_to_cart → checkout_started → shipping_info_added → payment_info_added → purchase` (category, brand, payment, shipping, coupon, device). Search: `search → product_viewed → add_to_cart` | has purchased, has account, used coupon, wishlisted; `purchase.first_purchase` |
| **Acme App** `acme-app` (React Native) | ~85 % sign up during onboarding. | Onboarding: `app_opened → onboarding_step_completed → signup_completed → notification_permission → post_created` (platform, app_version). Premium: `paywall_viewed → trial_started → subscription_started` (trigger, interval) | notifications granted, premium, has posted, platform |

Conversions (`EventMeta.conversion`) are flagged per project. Revenue events carry
whole-unit amounts (`events.revenue` is `UInt64`).

## How it is generated

- **Traffic**: per archetype an hourly curve, weekday curve, slow trend, an AR(1)
  drift, rare spikes/dips; Poisson per hour (`traffic.ts`).
- **People**: a per-project pool bucketed by first-seen day. A returning session picks
  a cohort through the archetype's retention curve (`sameDay`, `day1`, `day7`,
  `day30`) and a visitor through its stickiness (paid plan, notifications, has
  purchased…). Anonymous device ids rotate at UTC midnight (`world.ts`).
- **Journeys**: one state machine per archetype (`archetypes/*.ts`) with log-normal
  dwell times, state that persists across visits (cart, plan, onboarding step) and
  `identify()` at signup/login/purchase.
- **Rows**: shaped like the worker's (`rows.ts`) — `session_start`/`session_end`
  synthesized, one collapsed `sessions` row, one `profiles` row per device window or
  person. Devices/browsers come from real user agents through the real parser.
- **Isolation**: depends on `@openpanel/db` and `@openpanel/shared` only; row shapes are
  copied from core and checked against `test/clickhouse-schema.sql` by
  `clickhouse-rows.test.ts`.

## Not modelled (yet)

Bots, server-side events, late/duplicate events, groups/aliases, imports, geo-local
time of day, and very high property cardinality. For volume beyond `xl`, the plan is a
ClickHouse-side `--amplify` that copies a seeded slice with shifted dates.
