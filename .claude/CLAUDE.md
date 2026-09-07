# CLAUDE.md

NEVER CALL FORMAT! WE'LL FORMAT IN THE FUTURE WHEN WE HAVE MERGED ALL BIG PRS!

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Openpanel is an open-source web/product analytics platform (Mixpanel alternative). It's a **pnpm monorepo** with apps, packages, tooling, and SDKs.

## Common Commands

```bash
# Development
pnpm dev                    # Run apps/api (ROLE=all, port 3333) + apps/start dashboard (port 3000) in parallel
pnpm dev:public             # Run public/docs site only
pnpm dock:up / dock:down    # Start/stop Docker (PostgreSQL, Redis, ClickHouse)

# Code quality
pnpm check                  # Lint (Biome via Ultracite) + dependency-cruiser (check:deps)
pnpm fix                    # Auto-fix lint/format issues
pnpm typecheck              # Typecheck all packages

# Testing
pnpm test                        # vitest run — packages/* and apps/* (excluding apps/start, packages/core)
cd packages/core && bun test     # core's own suite (ADR-010; bun:test cannot run under vitest)
pnpm vitest run <path>           # Run a single vitest test file

# Database
pnpm codegen                # Generate the Prisma client + core's geo/bot/ASN data
pnpm migrate                # Run Prisma migrations (dev)
pnpm migrate:deploy         # Deploy migrations (production - never run this)

# Docker utilities
pnpm dock:ch                # ClickHouse CLI
pnpm dock:redis             # Redis CLI
```

## Architecture

### Apps

| App | Stack | Port | Purpose |
|-----|-------|------|---------|
| `apps/api` | Elysia on Bun, `ROLE=api\|worker\|all` | 3000 (`API_PORT`) | REST/tRPC API, BullMQ workers, Kafka ingest consumer — one process, role-gated |
| `apps/start` | TanStack Start (Vite + React 19) | 3000 (dev default; run alongside `apps/api` needs a distinct `API_PORT`) | Dashboard SPA |
| `apps/public` | Next.js 16 + Fumadocs | - | Marketing/docs site |

The standalone worker app is gone — M9 merged it into `apps/api`, selected at boot by `ROLE`.

### Key Packages

| Package | Purpose |
|---------|---------|
| `packages/core` | The backend: every module (`<name>.rpc.ts` / `.routes.ts` / `.jobs.ts` / `.service.ts`), the tRPC router, Elysia route surfaces, the BullMQ job registry, auth macros, the ClickHouse `sql` tag consumer code, shared utilities. `apps/api` is a thin shell that mounts it |
| `packages/db` | Prisma ORM (PostgreSQL) + ClickHouse client, the `sql` tagged-template query builder, migrations |
| `packages/redis` | Redis client (Bun `RedisClient`) + caching, locks, pub/sub |
| `packages/email` | React Email templates via Resend |
| `packages/payments` | Billing/subscription integration |
| `packages/sdks/*` | Client SDKs (web, react, next, express, react-native, etc.) |

### Data Flow

1. **Event ingestion**: Client SDKs → `apps/api` `/track` → Kafka/Redpanda topic `events`
2. **Processing**: `apps/api`'s Kafka consumer (any non-`api` role) batches events into ClickHouse
3. **Dashboard queries**: `apps/start` → tRPC (fetch adapter) → `apps/api` → ClickHouse (analytics) / PostgreSQL (config)
4. **Real-time**: WebSocket via Elysia, pub/sub via Redis

### Three-Database Strategy

- **PostgreSQL**: Relational data (users, orgs, projects, dashboards). Managed by Prisma.
- **ClickHouse**: Analytics event storage (OLAP). High-volume reads/writes.
- **Redis**: Caching, BullMQ job queues, rate limiting, pub/sub.

### Dashboard (apps/start)

Uses TanStack Router with file-based routing (`src/routes/`). State management via Redux Toolkit. UI built on Radix primitives + Tailwind v4. Charts via Recharts. Modals in `src/modals/`.

### API (apps/api)

Elysia on Bun, mounting `@openpanel/core`'s routers. No bundler — `bun run src/main.ts` runs the TypeScript directly (ADR-010). `main.ts` boots deps, `app.ts` wires the four Elysia scopes (root, dashboard, public API, ops); `ROLE` selects whether workers, schedulers and the Kafka consumer also start in this process.
---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**
- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**
- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**
- Use `class` and `for` attributes (not `className` or `htmlFor`)
