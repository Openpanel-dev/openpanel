# openpanel.dev design guide

How the marketing site (`apps/public`) looks and feels after the 2026-10
homepage redesign, and how to bring every other page up to the same level.
Read this before touching any page under `src/app/(content)` or `(home)`.

The homepage (`src/app/(home)`) is the reference. When in doubt, open it at
1440 px and match it.

## Feel

Clean, light, warm, calm. The product does the talking: real-looking
dashboard replicas instead of illustrations or screenshots, short copy,
one accent per idea. Think UserJot's homepage, with Linear's restraint.

- **Light only.** The theme is forced light at the root (`RootProvider
  theme={{ forcedTheme: 'light' }}`). Never add `dark:` variants.
- **Warm canvas, white cards.** Page background is `bg-canvas`
  (`#fafaf9`-ish). Cards are white with a soft shadow and a hairline ring,
  never a grey border. Chapter breaks are full-width warm-grey bands.
- **Borders are rare.** Separate things with space, tone and shadow. Use
  divider lines only inside lists (FAQ, footer).
- **One black button per screen.** Primary action is black, everything
  else is outline or text.
- **Colour means something.** Blue = web analytics, emerald = product
  analytics, violet = AI. Blue is also the data colour inside replicas.
  Nothing else is coloured.
- **Motion is quiet.** Things rise in on load or on scroll, numbers count
  up, hover lifts a card 4 px. No bounces, no parallax, no gradients that
  move. Everything respects `prefers-reduced-motion`.

## Tokens

| What | Value |
|---|---|
| Font | Geist (body), Geist Mono (numbers in replicas, code) |
| Headline | `font-semibold tracking-[-0.03em]`, `text-5xl md:text-7xl` (home), `text-4xl md:text-6xl` (other pages), `text-3xl md:text-4xl` (sections) |
| Body | `text-lg text-neutral-600` for ledes, `text-neutral-600` for copy, `text-neutral-500 text-sm` for meta |
| Eyebrow | `SectionLabel`: 11 px uppercase, tracked, neutral-500 |
| Canvas | `bg-canvas` (CSS var `--canvas`) |
| Grey band | `bg-stone-200/50`, fading band `from-canvas to-stone-200/70` |
| Card | `surface` utility (white, `rounded-2xl`, ring `black/4`, soft shadow); `surface-hover` adds the lift |
| Product window | `window-shadow` + `rounded-xl border border-black/8 bg-white` |
| Accents | `text-blue-600`, `text-emerald-600`, `text-violet-600` |
| Radius | `rounded-2xl` cards, `rounded-3xl` large panels, `rounded-full` pills |
| Section rhythm | `py-16 md:py-24` inside the page, `py-20 md:py-28` for bands |
| Container | 1000 px (`container`), hero visuals may go to `max-w-6xl` |

## Building blocks

All in `src/components` unless noted.

| Component | Use it for |
|---|---|
| `MarketingShell` | Layout for every marketing route: navbar, main, footer, canvas background. Docs do not use it. |
| `PageHero` | Top of any page: optional "New" pill, headline, lede, actions, optional visual below. Staggered entrance built in. |
| `HeroContainer` (`(home)/_sections/hero.tsx`) | Older, plainer hero wrapper still used by content pages. Prefer `PageHero`. |
| `Band` | Full-width section, tones `canvas`, `grey`, `fade`. Content stays in the container. |
| `SectionHeader`, `SectionLabel` (`section.tsx`) | Eyebrow + title + description, centred or left. |
| `Reveal` | Wrap anything that should fade and lift in on scroll. `delay` for stagger, `as="li"` inside lists. |
| `CountUp` | Any formatted number that should count up when seen (`"8,634"`, `"$412.30"`, `"19.9M"`). |
| `GrowthLine` | The interactive growth chart used in the closing band. |
| `dashboard-mock/*` | HTML replicas of the real product: `DashboardShell` (sidebar + toolbar), `WebOverviewContent`, `AiOverviewContent`, `FunnelContent`, `RetentionContent`, `ChatMock`, plus `primitives.tsx` (`StatCard`, `AreaChart`, `MockTable`, `Pill`) and `minis.tsx` (small pieces for feature cards). Build new replicas from these, never from screenshots. |
| `Testimonials` + `src/lib/testimonials.ts` | Quote grid. Add quotes to the list, not to the component. |
| `CtaBanner` | The closing band with the install snippet and the chart. Reuse on every page as the last section before the footer. |
| `Faq` / `faq.tsx` | Borderless accordion, two-column section. |
| `Navbar`, `Footer` | Shared. Features menu data is in `src/lib/nav.ts`. |
| CSS utilities (`global.css`) | `surface`, `surface-hover`, `window-shadow`, `bleed-left`, `bleed-right`, `animate-rise`, `reveal`, `container`, `col`, `row`, `center-center` |

## Page recipe

Every marketing page should read like this, top to bottom:

1. `PageHero`: one clear headline (colour one or two key words if it
   helps), a two-line lede, primary + outline action. If the page is about
   a feature, put a replica of that feature under the hero.
2. Proof early: logos, quotes or numbers, before the long explanation.
3. Two-column "pillar" sections: text (eyebrow, title, lede, three short
   points, one link) beside a product window that bleeds off the viewport
   edge (`bleed-right` / `bleed-left`, alternate sides). See
   `(home)/_sections/pillars.tsx`.
4. A grid of `surface` cards for the rest, with a small live-looking piece
   of UI in each, not icons.
5. A grey `Band` for the "why / trust" section.
6. FAQ when the page has real questions.
7. `CtaBanner`, then the footer.

Keep sections to one idea each, and let the product window be the biggest
thing on screen.

## Copy

- Short sentences, plain words, no marketing adjectives. Say what the
  reader gets, not what the feature is called.
- "Mixpanel alternative" stays in the homepage title/H1/body (it is the
  only non-brand phrase the homepage ranks for).
- Facts to keep straight: no free tier, cloud from $2.50 a month with a
  30-day trial, self-hosting is free and uses Docker Compose, EU hosting,
  cookie-less, AGPL. See the memory note "Canonical OpenPanel facts for
  copy" and `feedback_no_overclaiming_product_specs`.

## SEO guardrails

- Never change a URL. Never remove an internal link group: features,
  compare, use cases, articles, SDK docs, tools. The footer carries most
  of them; keep it on every page.
- `/tools/ip-lookup` is most of the site's organic traffic. Do not touch
  it in a redesign pass.
- Keep one `h1` per page with the page's keyword, and keep titles and
  descriptions from the content front matter.

## How to verify a page

1. `bun run dev` in `apps/public` (port 9090).
2. Screenshot at 1440 and 390 wide, full page, and look at it. A helper
   that works: Playwright `chromium.launch()`, viewport, `page.goto`,
   `page.screenshot({ fullPage: true })` run with `bun run` from
   `apps/start` where Playwright is installed.
3. Scroll through once before the full-page shot so `Reveal` sections
   are visible.
4. Emulate `colorScheme: 'dark'` once: nothing may change.
5. `bun run typecheck` in `apps/public`, `bunx biome check --write` on the
   files you touched.

## Things that were tried and rejected

- Illustrations (too abstract, "stock"). Use product replicas.
- Tweet cards as testimonials. Use real customer quotes.
- Dark CTA box at the bottom. Use the fading band with the install snippet.
- Bordered cards and bordered FAQ. Use `surface` and divider lines.
- Blue glows behind windows. Shadow only.
- Captions under the hero replica, taglines floating between sections.
  Every piece of text needs something to anchor to.
