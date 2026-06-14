# Dashboard (apps/start)

The user-facing analytics dashboard built with **TanStack Start** (React 19 + Vite) and **TanStack Router** v1. This is the main UI for the OpenPanel analytics platform, delivering real-time charts, user profiles, event analysis, and custom dashboards. The app is under active UI/UX work and uses tRPC to communicate with the backend API.

## Key Files

| Path | Purpose |
|------|---------|
| `apps/start/src/router.tsx` | TanStack Router initialization with React Query & tRPC integration |
| `apps/start/src/routes/` | File-based routing (64 route files, auto-generates routeTree.gen.ts) |
| `apps/start/src/routeTree.gen.ts` | Auto-generated route configuration (do not edit) |
| `apps/start/src/integrations/tanstack-query/root-provider.tsx` | React Query & tRPC client setup |
| `apps/start/src/trpc/client.ts` | tRPC client exports & type definitions |
| `apps/start/src/redux/index.ts` | Redux store setup (one slice: report chart state) |
| `apps/start/src/modals/index.tsx` | Modal system via pushmodal library (30+ modals) |
| `apps/start/src/server/get-envs.ts` | Server functions for environment variables |
| `apps/start/src/components/` | 100+ feature-organized components (overview, charts, profiles, etc.) |
| `apps/start/src/hooks/` | 32 custom hooks (data fetching, state, formatting) |
| `apps/start/vite.config.ts` | Vite config with TanStack plugins, Tailwind, Sentry, Nitro v2 / Cloudflare |
| `apps/start/package.json` | React 19, Radix UI, Recharts, D3, Redux Toolkit, etc. |

---

## Architecture Overview

### 1. Routing & Entry Point

**TanStack Router** manages file-based routing with the generated `routeTree.gen.ts`:

- **Root Route** (`apps/start/src/routes/__root.tsx`): 
  - Loads session & cookies before render
  - Sets up router context with tRPC, React Query client, API URL, environment flags
  - Wraps app with providers (Redux, theme, modals, notifications, Toaster)

- **Route Structure** (64 routes organized by features):
  - `/_app` — authenticated layout (requires session; shows sidebar)
  - `/_app/$organizationId` — org landing page
  - `/_app/$organizationId/$projectId/` — dashboard overview
  - `/_app/$organizationId/$projectId/events`, `/pages`, `/profiles`, `/sessions`, `/cohorts`, `/dashboards`, `/chat`, etc.
  - `/_login` — auth routes
  - `/_public` — public share routes
  - `/_steps` — onboarding flow
  - Route files use `createFileRoute()` with `beforeLoad` hooks for auth checks and data preloading

**Example Route** (`apps/start/src/routes/_app.$organizationId.$projectId.index.tsx`):
```tsx
export const Route = createFileRoute('/_app/$organizationId/$projectId/')({
  component: ProjectDashboard,
  head: () => ({ meta: [{ title: createProjectTitle(PAGE_TITLES.DASHBOARD) }] }),
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  return (
    <div className="grid grid-cols-6 gap-4 p-4 pt-0">
      <OverviewMetrics projectId={projectId} />
      <OverviewTopSources projectId={projectId} />
      <OverviewTopPages projectId={projectId} />
      <OverviewTopDevices projectId={projectId} />
      <OverviewTopEvents projectId={projectId} />
      <OverviewTopGeo projectId={projectId} />
    </div>
  );
}
```

### 2. Data Fetching & Client Wiring (tRPC + React Query)

**tRPC Integration** (`apps/start/src/integrations/tanstack-query/root-provider.tsx`):

- **Client Setup**: Creates a tRPC client with `httpLink` to `{apiUrl}/trpc` with CORS credentials
- **Serialization**: Uses `superjson` for Date/Map/Set support
- **React Query Configuration**:
  - `staleTime: 1h` — data cached for 1 hour
  - `gcTime: 2h` — unused data kept for 2 hours
  - `refetchOnReconnect/WindowFocus/Mount: false` — reduces unnecessary queries
  - `retry: 1` — single retry on failure

**tRPC Router Type** (`apps/start/src/trpc/client.ts`):
```tsx
import { useTRPC } from '@/integrations/trpc/react';
export const api = useTRPC(); // client hook
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;
```

**Usage in Components**:
```tsx
const trpc = useTRPC();
const { data } = useSuspenseQuery(trpc.organization.list.queryOptions());
const { mutate } = useMutation({
  mutationFn: trpc.dashboard.create.mutate,
  onSuccess: () => { /* refetch */ }
});
```

Backend tRPC routers are defined in `packages/trpc/src/routers/` (auth, chart, dashboard, organization, profile, session, etc.) and exported from `packages/trpc/src/root.ts`.

### 3. State Management

**Redux Store** (`apps/start/src/redux/index.ts`):
- **Single Reducer**: `reportSlice` — manages chart/report state for the dashboard builder
- **Purpose**: Stores chart configuration (events, breakdowns, filters, intervals, chart type, etc.)
- **Actions**: 34 actions (setReport, addSerie, changeInterval, changeChartType, changeDateRanges, addGlobalFilter, etc.)
- **Integration**: Store is created in `Providers` component and wrapped with Redux Provider

**Example Usage** (`apps/start/src/components/report/reportSlice.ts`):
```tsx
const { setReport, addSerie, changeChartType } = reportSlice.actions;
// Component usage:
const dispatch = useDispatch();
dispatch(setReport({ name: 'My Chart', chartType: 'linear', series: [...] }));
```

**React Query** handles server-state (data from API); Redux handles UI/client-state (chart builder form state).

### 4. Modals System

**pushmodal Library** (`apps/start/src/modals/index.tsx`):
- Provides `createPushModal()` with 30+ registered modal components
- API: `pushModal(name, props)`, `popModal()`, `replaceWithModal()`, `popAllModals()`
- Hook: `useOnPushModal('*', callback)` — tracks all modal opens

**Registered Modals** (30+):
- Data: `AddProject`, `AddDashboard`, `EditDashboard`, `EditReport`, `AddClient`, `AddCohort`, `EditCohort`, `AddCustomEvent`, `EditCustomEvent`, `AddIntegration`, `AddNotificationRule`
- Views: `OverviewChartDetails`, `EventDetails`, `ViewChartUsers`, `OverviewTopPagesModal`, `OverviewTopGenericModal`
- Auth/UX: `RequestPasswordReset`, `CreateInvite`, `SelectBillingPlan`, `BillingSuccess`
- Pickers: `DateRangerPicker`, `DateTimePicker`, `OverviewFilters`
- Generic: `Confirm`, `Instructions`, `OnboardingTroubleshoot`

**Modal Structure** (`apps/start/src/modals/Modal/Container.tsx`):
```tsx
<ModalHeader title="Create Project" onClose={popModal} />
<ModalContent>
  {/* form or content */}
</ModalContent>
```

**Usage**:
```tsx
import { pushModal, popModal } from '@/modals';

// In a component:
pushModal('AddProject', { organizationId: 'org-123' });
// Inside the modal:
popModal();
```

**Tracking**: Global middleware `onPushModal('*', ...)` logs screen views to OpenPanel analytics (apps/start/src/modals/index.tsx:89).

### 5. Server Functions & Environment

**Server Functions** (`apps/start/src/server/get-envs.ts`):
```tsx
export const getServerEnvs = createServerFn().handler(async () => {
  return {
    apiUrl: process.env.API_URL,
    dashboardUrl: process.env.DASHBOARD_URL,
    isSelfHosted: process.env.SELF_HOSTED !== undefined,
    isMaintenance: process.env.MAINTENANCE === '1',
  };
});
```
- Runs on server during route `beforeLoad`; results injected into router context
- Used to pass API URL, dashboard URL, and feature flags to client

### 6. Components Organization

Components are organized by feature domain under `apps/start/src/components/`:

| Domain | Purpose |
|--------|---------|
| `overview/` | Dashboard overview: metrics, top pages/sources/devices/events/geo, live counter |
| `report/` | Report/chart editor: chart builder, formula builder, report chart rendering |
| `report-chart/` | Chart rendering by type (linear, bar, area, conversion, funnel, table, scatter) |
| `events/` | Event management: event list, event details, stats |
| `profiles/` | User profile view: profile details, session history, event timeline |
| `sessions/` | Session management: session list, session replay with rrweb-player |
| `clients/` | SDK client management: add/edit client, SDK keys, setup |
| `cohort/` | Cohort builder: create & edit user cohorts |
| `custom-event/` | Custom event configuration |
| `projects/` | Project switcher, project settings |
| `organization/` | Org settings, billing, members, integrations |
| `auth/` | Login, logout, session management |
| `charts/` | Specific chart components (Recharts + D3 wrappers) |
| `realtime/` | Real-time event stream visualization |
| `integrations/` | Third-party integrations UI |
| `settings/` | Project settings: events, clients, imports, etc. |
| `notifications/` | Notification center, rules |
| `ui/` | Radix UI + shadcn/ui primitives (Button, Dialog, Form, etc.) |
| `forms/` | Reusable form components |
| `chat/` | AI chat interface |

### 7. Hooks

32 custom hooks in `apps/start/src/hooks/`:

**Data & Query**:
- `use-event-names.ts` — fetch event names for a project
- `use-event-properties.ts` — fetch event properties for filtering
- `use-property-values.ts` — fetch values for a property
- `use-cohorts.ts` — fetch cohorts
- `use-session-extension.ts` — extend session timeout

**State & Formatting**:
- `use-app-context.ts` — access router context (apiUrl, isSelfHosted, etc.)
- `use-app-params.ts` — get current org/project/dashboard IDs from params
- `use-numer-formatter.ts` — format numbers with locale support
- `use-format-date-interval.ts` — format date intervals
- `use-theme.ts` — get current theme (light/dark)

**Form & Input**:
- `use-debounce-state.ts` — debounced state setter
- `use-debounce-value.ts` — debounced value
- `use-debounced-callback.ts` — debounced callback

**Chart-specific**:
- `use-rechart-data-model.ts` — transform chart data for Recharts
- `use-conversion-rechart-data-model.ts` — convert conversion data
- `use-visible-series.ts` — manage visible/hidden series in charts
- `use-dashed-stroke.ts` — compute dashed stroke offsets for D3

**Auth**:
- `use-logout.ts` — logout mutation

### 8. i18n & Translations

**Translation Files** (`apps/start/src/translations/`):
- `countries.ts` — ISO country codes and names
- `properties.ts` — standard event property names (os, browser, device_type, etc.)

No full i18n library (no react-i18next); translations are minimal. Feature flags and organization-specific strings handled via API.

### 9. Build & Environment

**Vite Config** (`apps/start/vite.config.ts`):
```tsx
const plugins = [
  viteTsConfigPaths(),
  tailwindcss(),
  tanstackStart(),     // TanStack Start SSR plugin
  viteReact(),
];

if (process.env.NITRO) {
  plugins.unshift(nitroV2Plugin({ preset: 'node-server' }));
} else {
  plugins.unshift(cloudflare({ viteEnvironment: { name: 'ssr' } }));
}

wrapVinxiConfigWithSentry(config, { org, project, authToken });
```

- **Local Dev** (`NITRO=1`): Uses Nitro v2 for Node SSR (skip Cloudflare plugin)
- **Production**: Cloudflare Workers (default)
- **Sentry**: Source maps uploaded for error tracking

**Dependencies**:
- **UI**: Radix UI (23 component packages), shadcn/ui, Lucide icons, Framer Motion
- **Forms**: React Hook Form + Zod validation
- **Charts**: Recharts (primary), D3 (geo, advanced), React Simple Maps
- **Tables**: TanStack React Table
- **Grid/Drag**: React Grid Layout, @dnd-kit
- **Date**: date-fns, React Day Picker
- **State**: Redux Toolkit, React Query, TanStack Router
- **Utils**: Lodash (debounce, throttle, isEqual), Ramda, clsx, class-variance-authority
- **Analytics**: @openpanel/web (self-instrumentation)
- **Error**: Sentry

### 10. How It Connects

```
┌─ User Browser ───────────────────────┐
│                                       │
│  ┌─ TanStack Router ────────────┐   │
│  │  File-based routing (64 routes)  │
│  │  ├─ /__root (load session)       │
│  │  ├─ /_login, /_public           │
│  │  ├─ /_app/$org/$project/...    │
│  │  └─ /_steps (onboarding)        │
│  └─────────────────────────────┘   │
│           │                         │
│           v                         │
│  ┌─ Router Context ───────────────┐ │
│  │ {                               │ │
│  │   queryClient (React Query)     │ │
│  │   trpc (tRPC client proxy)      │ │
│  │   apiUrl: "http://localhost..."│ │
│  │   session, isSelfHosted, etc.   │ │
│  │ }                               │ │
│  └─────────────────────────────┘   │
│           │                         │
│           v                         │
│  ┌─ Providers ─────────────────────┐│
│  │ ├─ Redux (report slice)         ││
│  │ ├─ Theme Provider               ││
│  │ ├─ Modal Provider (pushmodal)   ││
│  │ ├─ Notification Provider        ││
│  │ ├─ React Query                  ││
│  │ └─ Toaster (Sonner)             ││
│  └─────────────────────────────┘   │
│           │                         │
│           v                         │
│  ┌─ Components ────────────────────┐│
│  │ Overview | Events | Profiles... ││
│  │ (use hooks, redux dispatch,     ││
│  │  tRPC queries/mutations)        ││
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
           │
           │ tRPC over HTTP (with cookies)
           │
┌──────────v──────────────────────────┐
│ Backend API (apps/api)              │
│                                      │
│ ┌─ tRPC Router (packages/trpc) ──┐ │
│ │ ├─ auth.session, auth.logout  │ │
│ │ ├─ chart.chart, chart.list    │ │
│ │ ├─ dashboard.*, report.*      │ │
│ │ ├─ organization.*, project.* │ │
│ │ ├─ event.*, profile.*, etc.   │ │
│ │ └─ ... 23 routers total       │ │
│ └───────────────────────────────┘ │
│           │                        │
│           v                        │
│ ┌─ Databases ─────────────────────┐│
│ │ PostgreSQL (Prisma ORM)         ││
│ │ ClickHouse (analytics events)   ││
│ │ Redis (cache/queue)             ││
│ └────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## Development & Running

### Setup
```bash
# Copy env file
cp .env.example .env

# Set NITRO=1 for local Node SSR (skip Cloudflare plugin)
export NITRO=1

# Install deps
pnpm install

# Generate Prisma + codegen
pnpm codegen
pnpm migrate
```

### Run
```bash
# Dashboard on port 3000
pnpm --filter start dev

# API on port 3333 (parallel, in another shell)
pnpm dev  # runs API + Worker via workspace scripts
```

### Build
```bash
# Production bundle with source maps for Sentry
pnpm --filter start build

# Preview locally
pnpm --filter start preview
```

### Type Checking
```bash
pnpm --filter start typecheck
```

### Lint & Format
```bash
pnpm --filter start lint
pnpm --filter start format
```

---

## Key Patterns & Conventions

### Styling
- **Tailwind CSS** with `@tailwindcss/vite` plugin (Tailwind 4)
- **Dark mode**: Class-based (theme-provider.tsx) with `ThemeScriptOnce` to prevent flashing
- **Component lib**: Radix UI primitives + shadcn/ui recipes in `src/components/ui/`
- **Utility CSS**: Global `src/styles.css` (cached with force cache-bust comment)

### Data Fetching
- **Server data** (from tRPC API): React Query `useQuery()` or `useSuspenseQuery()`
- **Mutations**: `useMutation()` with optional `onSuccess` to refetch related queries
- **Prefetch**: Use `context.queryClient.ensureQueryData()` in route `beforeLoad` for server-side preloading

### Form Handling
- **Library**: React Hook Form with Zod schema validation
- **Resolvers**: `@hookform/resolvers/zod`
- **Modal forms**: Often inside `EditX` or `AddX` modals; call tRPC mutation on submit, show toast on success/error

### Error Handling
- **tRPC errors**: `handleError(error)` from integrations/trpc/react.tsx (shows Sonner toast)
- **Auth errors**: 401 redirects handled at root route `beforeLoad` via session check
- **Maintenance mode**: Environment flag `MAINTENANCE === '1'` shows full-page message

---

## Gotchas & Important Notes

1. **routeTree.gen.ts is Auto-Generated**: Do NOT edit this file. It's generated from `src/routes/**/*.tsx` files by the `@tanstack/router-plugin`. If routes don't appear, run `pnpm dev` to trigger codegen.

2. **Redux vs React Query**: Redux stores *chart builder state* (dirty form state, temporary selections). React Query stores *server data*. Don't mix them; keep Redux for UI state only.

3. **Modal Props Type Safety**: Modal props are not typesafe by default (pushmodal limitation). If adding a new modal, ensure component prop types are correct and test at callsite.

4. **tRPC Client Initialization**: The client is created in `root-provider.tsx` with the `apiUrl` from server env. Ensure `API_URL` env var is set on both server and client (via NEXT_PUBLIC_API_URL fallback).

5. **Cookies & CORS**: tRPC fetch includes `credentials: 'include'` for cookie-based auth. Ensure backend API sets `Access-Control-Allow-Credentials: true`.

6. **Stale Time & Cache**: Chart/report queries use 1-hour `staleTime`. If data doesn't refresh after mutation, manually call `queryClient.invalidateQueries()` in mutation success handler.

7. **Server Functions Only on SSR Routes**: Server functions like `getServerEnvs` only run during initial page load on server. Client-side navigation won't call them again. Store results in router context.

8. **Modal Tracking**: Every modal open is tracked to analytics (onPushModal middleware). If modal is sensitive, handle separately or disable tracking.

9. **Theme Flash**: Ensure `ThemeScriptOnce` is placed in `<head>` of root document. If dark mode flashes on load, this script prevents it by setting `document.documentElement.classList` before React hydrates.

10. **TypeScript Paths**: `@/` alias is configured in `vite-tsconfig-paths`. All imports use this; no relative imports for consistency.

---

## Unverified / TODO

- Full test coverage: Vitest configured but most components lack unit tests. No integration/E2E tests observed.
- i18n scope: Translation files exist but no multi-language switching UX; unclear if feature is planned.
- Offline support: Service workers not configured; offline experience untested.
- WebSocket updates: `use-ws.ts` hook exists but real-time sync implementation incomplete; unclear which views auto-update on new events.
- Module federation: No micro-frontend setup; monorepo is single build unit.
- Performance monitoring: Sentry is configured but no explicit Web Vitals instrumentation beyond `web-vitals` dependency.
- Storybook: Component catalog not observed; component library documentation unclear.
- Deployment: Cloudflare Workers config exists but no detailed worker-side routing logic reviewed.

