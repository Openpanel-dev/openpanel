# Public site (marketing + product documentation)

**Next.js marketing website and canonical product documentation for OpenPanel.** `apps/public` delivers openpanel.dev, combining a landing/home page, articles, guides, and comprehensive product docs (SDKs, API, self-hosting). Uses Fumadocs for MDX content rendering and a static file-based comparison data system for competitor analytics pages.

## Key files

| File / Path | Purpose |
|---|---|
| `apps/public/package.json` | Dependencies: Next.js 16, Fumadocs (core, ui 16.2.2; mdx 14.0.4), Tailwind 4, Radix UI, Framer Motion |
| `apps/public/next.config.mjs` | MDX via Fumadocs, image domains config, redirects |
| `apps/public/source.config.ts` | Fumadocs collection config: docs, articles, guides, pages schemas |
| `apps/public/src/app/layout.tsx` | Root layout; wraps with RootProvider + OpenPanel tracking component |
| `apps/public/src/app/(home)/page.tsx` | Landing page (hero, features, testimonials, pricing, CTA sections) |
| `apps/public/src/app/docs/layout.tsx` | Docs layout powered by Fumadocs DocsLayout |
| `apps/public/src/app/docs/[[...slug]]/page.tsx` | Dynamic docs page renderer using `source.getPage()` |
| `apps/public/src/app/(content)/layout.tsx` | Marketing layout with Navbar + Footer |
| `apps/public/src/lib/source.ts` | Fumadocs loaders for docs, articles, guides; compare data loader |
| `apps/public/src/lib/metadata.ts` | SEO metadata factory |
| `apps/public/src/mdx-components.tsx` | MDX component registry (tabs, accordions, FAQs, figures, custom components) |
| `apps/public/content/docs/` | **Canonical product docs**: get-started, tracking SDKs, API, self-hosting, migration |
| `apps/public/content/docs/(tracking)/sdks/` | SDK docs: script, web, JS, React, Next.js, Vue, Astro, Python, Rust, Ruby, Kotlin, Swift, React Native, Express, Remix |
| `apps/public/content/articles/` | Blog articles (introductions, guides, comparisons) |
| `apps/public/content/guides/` | Step-by-step guides (framework analytics, migrations, e-commerce tracking) |
| `apps/public/content/compare/` | Competitor comparison data (JSON) and competitor page routes |

## Overview

### App structure

The Next.js app uses **route groups** to organize content:

- **`(home)`**: Landing page with hero, features, testimonials, pricing calculator (uses local state for slider), FAQ
- **`(content)`**: Marketing pages (articles, guides, pages) with Navbar + Footer
  - `/articles` — lists blog posts from `articleCollection`
  - `/guides` — lists step-by-step guides from `guideCollection`
  - `/[...pages]/` — dynamic pages (privacy, terms, contact) from `pageCollection`
  - `/compare` — competitor alternatives index
  - `/compare/[slug]` — individual competitor comparison (loaded from `content/compare/*.json`)
  - `/pricing` — pricing page
  - `/supporter` — supporter/backer page
- **`docs`**: Product documentation using Fumadocs DocsLayout
  - `/docs/[[...slug]]/` — dynamic product docs
- **`api/[...op]`**: Passthrough to OpenPanel SDK route handler (`@openpanel/nextjs`)
- **`tools`**: Utility tools (URL checker, IP lookup)

#### API routes

Beyond the SDK passthrough, `src/app/api/` exposes a few support endpoints:

- `/api/search` — Fumadocs full-text search (`createFromSource(source)` from `fumadocs-core/search/server`)
- `/api/headers` — IP/header debugging; returns request headers and detected client IPs
- `/api/tools/*` — backends for the utility tools: `ip-lookup` (geo/DNS/ASN lookup) and `site-checker` (SEO/social/timing site analysis)

### Content sources

Fumadocs orchestrates three main content collections via `source.config.ts`:

1. **`docs`** (defineDocs) — product documentation
   - Dir: `content/docs/`
   - Schema: frontmatterSchema (title, description, body)
   - Structure:
     - `index.mdx` — intro ("What is OpenPanel?")
     - `get-started/` — install, identify, track
     - `(tracking)/` — how-it-works, adblockers, revenue-tracking
       - `sdks/` — 15 SDK docs (JavaScript, Python, React Native, Kotlin, Swift, Rust, Ruby, Astro, Next.js, Express, Remix, Vue, web, script, react)
     - `api/` — authentication, track, insights, export
     - `self-hosting/` — deploy options (Docker Compose, Kubernetes, Coolify, Dokploy), env vars, changelog
     - `migration/` — v1→v2, beta docs

2. **`articleCollection`** — blog articles
   - Dir: `content/articles/`
   - Schema: title, description, date, cover, tag, team, updated
   - Examples: alternatives-to-mixpanel, cookieless-analytics, self-hosting guides

3. **`guideCollection`** — in-depth guides
   - Dir: `content/guides/`
   - Schema: title, description, difficulty, timeToComplete (minutes), date, steps (with anchors), cover
   - Examples: migrate-from-ga, nextjs-analytics, react-analytics, e-commerce-tracking

4. **`pageCollection`** — utility pages
   - Dir: `content/pages/`
   - Examples: privacy, terms, cookies, contact, about

5. **Compare data** (manual loader in `source.ts`)
   - Dir: `content/compare/`
   - Format: JSON files (e.g., `mixpanel-alternative.json`)
   - Loaded at runtime; each file becomes a page at `/compare/[slug]`
   - Contains: competitor profile, feature matrix, pricing, pros/cons, migration CTA

### Content rendering

- **Docs**: `source.getPage(slug)` loads MDX, renders via `DocsPage` + `DocsBody`; `getMDXComponents()` injects Fumadocs components (tabs, accordions, code), Lucide icons, custom components (Figure, WindowImage, FAQ)
- **Articles/Guides**: Loaders sort by date; each article/guide gets a detail page with metadata
- **Compare**: JSON loaded at build time; rendered via custom `CompareHero` and layout components
- **Collections**: Fumadocs-MDX auto-generates static params (`generateStaticParams()`); all pages are SSG

### Site identity

- **Base URL**: production = `https://openpanel.dev`, dev = `http://localhost:3000`
- **Sitename**: "OpenPanel"
- **Fonts**: Geist + Geist Mono (Google Fonts)
- **Theme**: Tailwind 4 with dark mode (via next-themes)
- **Tracking**: Instrumented with `@openpanel/nextjs` SDK (conditionally if `NEXT_PUBLIC_OP_CLIENT_ID` set); tracks views, attributes, outgoing links

## How it connects

### To the dashboard and API
- Embedded OpenPanel tracking sends events to the public site's own OpenPanel project (via `/api/[...op]/` route handler)
- `NEXT_PUBLIC_API_URL` (default `http://localhost:3333`) would be set for production links/auth flows (not used in public site code currently)

### To the docs system
- The **canonical product docs** live in `apps/public/content/docs/`. These are distinct from the developer docs being generated (e.g., architecture, component deep-dives). Product docs are user-facing: SDK setup, API reference, self-hosting guides.

### To the SDK packages
- Docs reference `@openpanel/nextjs` (embedded tracking), `@openpanel/sdk-info` (runtime metadata), `@openpanel/common` (shared types), `@openpanel/payments` (pricing logic), `@openpanel/geo` (geolocation for docs)
- SDK docs in `content/docs/(tracking)/sdks/` describe how to integrate SDKs; they are autogenerated or manually maintained mirrors of actual SDK docs

### To the web app workspace
- Uses shared components (Radix UI, Tailwind tokens, UI lib `@openpanel/common`)
- No tight coupling to dashboard or API logic—this is a static/semi-dynamic Next.js app

## Gotchas

1. **Fumadocs postinstall**: `postinstall` script runs `fumadocs-mdx`, which generates `.source/` directory. Check-in of `.source/` may or may not be desired; regeneration is deterministic if content is stable.
2. **SSG build cost**: Docs + articles + guides + compare pages are all statically generated. Large doc trees may slow build.
3. **Compare data manual load**: `compareSource` loads JSON at module init in `source.ts`. If new compare files are added, rebuild required (not hot-reloaded).
4. **MDX component scope**: Custom components (Figure, WindowImage) must be imported in `mdx-components.tsx` or won't be available in content.
5. **Link resolution**: Fumadocs' `createRelativeLink()` in docs enables relative links (e.g., `[sibling page](./sibling.mdx)`), but this only works inside the docs route group; article/guide links need absolute routes.
6. **Image domains**: `next.config.mjs` explicitly allows `localhost`, `openpanel.dev`, `api.openpanel.dev`; other domains will fail image optimization.

## Dev setup

```bash
cd apps/public
pnpm install
pnpm dev
```

Runs on `http://localhost:3000` (or next available port if 3000 in use).

```bash
pnpm build     # SSG + static exports
pnpm start     # Production server
pnpm typecheck # TypeScript + fumadocs-mdx check
pnpm lint      # Biome check
pnpm format    # Biome format
```

## Deployment

Deployed as part of the monorepo build pipeline (merge to `main` triggers Docker build). Runs as a Next.js app; outputs static HTML for all docs/articles/guides, with on-demand ISR if needed (not currently configured).

## Unverified / TODO

- Exact OpenPanel event payload captured from public site (confirm `trackAttributes`, `trackScreenViews`, `trackOutgoingLinks` flags)
- Whether compare JSON is version-controlled or auto-generated (assumed manual)
- Details of author/byline system for articles/guides (schema allows `team` but rendering not inspected)
- Whether redirect list in `next.config.mjs` is exhaustive or maintained dynamically
- Link verification in docs (dead link detection in CI)
- SEO sitemap generation (static sitemap or dynamic `/app/sitemap.ts`)
