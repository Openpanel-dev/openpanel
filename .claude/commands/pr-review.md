Review the current PR by running `git diff main...HEAD` and examining all changed files. For each category below, report **PASS**, **WARN** (minor issue, should fix), or **FAIL** (must fix before merge) with specific `file:line` references.

---

## Security

- No SQL injection: ClickHouse and Prisma queries use parameterized inputs — no string interpolation into query bodies
- No raw SQL in Prisma unless absolutely necessary (use Prisma client methods)
- No secrets, tokens, or API keys hardcoded
- No `eval()`, `dangerouslySetInnerHTML`, or `target="_blank"` without `rel="noopener"`
- User input validated/sanitized at system boundaries (API entry points only)

## Authorization & Data Access

- Every `protectedProcedure` gets the `enforceAccess` middleware (`rpc/base.ts`) for free — it reads the raw, top-level `projectId`/`organizationId` and calls `ctx.services.auth`, which is `shared/access.ts`'s single `createAccessChecks` ladder, bound once centrally in `auth.service.ts` (M10-002)
- All ClickHouse queries filter by `project_id` — no cross-project data leaks
- All Prisma queries scope to the authenticated user's org/project — no missing `organizationId`/`projectId` where clauses
- No client-provided IDs trusted for authorization without server-side validation
- Note: `enforceAccess` only checks `projectId`/`organizationId` in *input* — secondary object ids (reportId, dashboardId, …) need an in-handler check (ADR-011)

## Architecture: Service Layer

- Data fetching and mutation logic lives in `packages/core/src/modules/<name>/<name>.service.ts` — not inline in tRPC routers or route handlers
- tRPC routers should call service functions, not query ClickHouse/Prisma directly
- New job types are declared in the owning module's `<name>.jobs.ts` and spread into `packages/core/src/jobs.registry.ts` — not inline in app code. A cron schedule is the job's own `cron` field (ADR-021), not a second registry

## Architecture: Validation

- Zod schemas used by more than one module, or by `apps/start`/an SDK, belong in the owning module's `<name>.constants.ts` (imports only zod, other constants, or types — ADR-008) — not defined locally in a router or component
- All tRPC procedures use `.input(zodSchema)` for input validation
- Schemas used only within a single file can stay local

## Code Quality

- No `console.log`, `debugger`, or `alert` left in
- No `any` types without a comment explaining why
- Error handling is meaningful — no catch-and-rethrow without transformation
- No unused variables or imports
- No N+1 queries — batch with Prisma `findMany` + filter, or use ClickHouse aggregation

## General Patterns

- No new barrel files (`index.ts` that re-exports everything from a folder)
- No speculative abstractions — helpers/utilities only if used in 2+ places
- No backwards-compat shims for code that was simply removed


## Clickhouse

- Queries should be optimized for very large datasets
- Static queries are raw SQL with ClickHouse-native `{name:Type}` bound params
- Dynamic composition (chart engine, filters, breakdowns) uses `@openpanel/db`'s `sql` tagged template — never `${}` of a raw value, never hand-rolled string concatenation (ADR-013)

---

After the checklist, provide a short **Summary** section: overall risk level (low / medium / high), the most critical issues if any, and whether the PR is ready to merge.
