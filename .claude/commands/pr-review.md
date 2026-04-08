Review the current PR by running `git diff main...HEAD` and examining all changed files. For each category below, report **PASS**, **WARN** (minor issue, should fix), or **FAIL** (must fix before merge) with specific `file:line` references.

---

## Security

- No SQL injection: ClickHouse and Prisma queries use parameterized inputs — no string interpolation into query bodies
- No raw SQL in Prisma unless absolutely necessary (use Prisma client methods)
- No secrets, tokens, or API keys hardcoded
- No `eval()`, `dangerouslySetInnerHTML`, or `target="_blank"` without `rel="noopener"`
- User input validated/sanitized at system boundaries (API entry points only)

## Authorization & Data Access

- Every tRPC procedure that accesses project/org data uses the appropriate access check (`getProjectAccess`, `getOrganizationAccess`, `getClientAccess` from `@openpanel/db`)
- All ClickHouse queries filter by `project_id` — no cross-project data leaks
- All Prisma queries scope to the authenticated user's org/project — no missing `organizationId`/`projectId` where clauses
- No client-provided IDs trusted for authorization without server-side validation
- Note: all `protectedProcedure` which either have `organizationId` or `projectId` will be ensured correct access in the middleware

## Architecture: Service Layer

- Data fetching and mutation logic lives in `packages/db/src/services/` — not inline in tRPC routers or API route handlers
- tRPC routers should call service functions, not query ClickHouse/Prisma directly
- New queue job types defined in `packages/queue/src/queues.ts`, not inline in app code

## Architecture: Validation

- Zod schemas used in more than one package/app belong in `packages/validation/src/` — not defined locally in a router or component
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
- `chQuery` can be used for simple queries
- `clix` should be used when we have a lot of dynamic sql queries

---

After the checklist, provide a short **Summary** section: overall risk level (low / medium / high), the most critical issues if any, and whether the PR is ready to merge.
