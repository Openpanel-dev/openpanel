# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Openpanel is an open-source web/product analytics platform (Mixpanel alternative). It's a **pnpm monorepo** with apps, packages, tooling, and SDKs.

## Common Commands

```bash
# Development
pnpm dev                    # Run all services (api, worker, dashboard) in parallel
pnpm dev:public             # Run public/docs site only
pnpm dock:up / dock:down    # Start/stop Docker (PostgreSQL, Redis, ClickHouse)

# Code quality
pnpm check                  # Lint check (Biome via Ultracite)
pnpm fix                    # Auto-fix lint/format issues
pnpm typecheck              # Typecheck all packages

# Testing
pnpm test                   # Run all tests (vitest)
pnpm vitest run <path>      # Run a single test file
# Workspace: packages/* and apps/* (excluding apps/start)

# Database
pnpm codegen                # Generate Prisma types + geo data
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
| `apps/api` | Fastify + tRPC | 3333 | REST/RPC API server |
| `apps/start` | TanStack Start (Vite + React 19) | 3000 | Dashboard SPA |
| `apps/public` | Next.js 16 + Fumadocs | - | Marketing/docs site |
| `apps/worker` | Express + BullMQ | 9999 | Background job processor |

### Key Packages

| Package | Purpose |
|---------|---------|
| `packages/db` | Prisma ORM (PostgreSQL) + ClickHouse client |
| `packages/trpc` | tRPC router definitions, context, middleware |
| `packages/auth` | Authentication (Arctic OAuth, Oslo sessions, argon2) |
| `packages/queue` | BullMQ + GroupMQ job queue definitions |
| `packages/redis` | Redis client + LRU caching |
| `packages/validation` | Zod schemas shared across apps |
| `packages/common` | Shared utilities (date-fns, ua-parser, nanoid) |
| `packages/email` | React Email templates via Resend |
| `packages/sdks/*` | Client SDKs (web, react, next, express, react-native, etc.) |

### Data Flow

1. **Event ingestion**: Client SDKs → `apps/api` (track routes) → Redis queue
2. **Processing**: `apps/worker` picks up jobs from BullMQ, batches events into ClickHouse
3. **Dashboard queries**: `apps/start` → tRPC → `apps/api` → ClickHouse (analytics) / PostgreSQL (config)
4. **Real-time**: WebSocket via Fastify, pub/sub via Redis

### Three-Database Strategy

- **PostgreSQL**: Relational data (users, orgs, projects, dashboards). Managed by Prisma.
- **ClickHouse**: Analytics event storage (OLAP). High-volume reads/writes.
- **Redis**: Caching, job queues (BullMQ), rate limiting, pub/sub.

### Dashboard (apps/start)

Uses TanStack Router with file-based routing (`src/routes/`). State management via Redux Toolkit. UI built on Radix primitives + Tailwind v4. Charts via Recharts. Modals in `src/modals/`.

### API (apps/api)

Fastify server with tRPC integration. Route files in `src/routes/`. Hooks for IP extraction, request logging, timestamps. Built with `tsdown`.

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Biome (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

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

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Biome Can't Help

Biome's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Biome can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Biome. Run `pnpm dlx ultracite fix` before committing to ensure compliance.
