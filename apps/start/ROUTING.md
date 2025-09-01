# Routing Structure

This SaaS application uses TanStack Router with pathless routes (using underscore prefix) for better organization and shared layouts.

## Route Structure

### Landing Page
- **Route**: `/`
- **File**: `src/routes/index.tsx`
- **Purpose**: Landing page that redirects to latest organization or shows all organizations

### Authentication Routes (Pathless Layout: `_auth`)
- **Layout**: `src/routes/_auth.tsx` - Shared layout for auth pages
- **Login**: `/login` - `src/routes/_auth.login.tsx`
- **Onboarding**: `/onboarding` - `src/routes/_auth.onboarding.tsx`
  - **Index**: `/onboarding/` - `src/routes/_auth.onboarding.index.tsx`
  - **Step 1**: `/onboarding/step1` - `src/routes/_auth.onboarding.step1.tsx`

### App Routes (Pathless Layout: `_app`)
- **Layout**: `src/routes/_app.tsx` - Shared layout with sidebar for app pages
- **Organization**: `/$organizationId` - `src/routes/_app.$organizationId.tsx`
- **Project**: `/$organizationId/$projectId` - `src/routes/_app.$organizationId.$projectId.tsx`

## Pathless Routes

### `_auth` Layout
- **Purpose**: Groups authentication and onboarding routes
- **Shared Layout**: Clean, centered layout with white background
- **Routes**: `/login`, `/onboarding/*`

### `_app` Layout
- **Purpose**: Groups organization and project routes
- **Shared Layout**: Sidebar + main content layout
- **Routes**: `/$organizationId`, `/$organizationId/$projectId`

## Landing Page Behavior

The landing page (`/`) intelligently handles user state:

1. **If user has a latest organization**: Shows "Continue where you left off" button
2. **If no latest organization**: Shows login/onboarding options
3. **Always shows**: List of all user's organizations

## Sidebar Behavior

The sidebar in the `(app)` layout dynamically changes based on the route:

- **Organization level** (`/$organizationId`): Shows projects list
- **Project level** (`/$organizationId/$projectId`): Shows dashboard navigation

## Adding New Routes

### For Auth Routes
Create new files with the pattern `src/routes/_auth.your-route.tsx`:
```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/your-route')({
  component: YourComponent,
});
```

### For App Routes
Create new files with the pattern `src/routes/_app.your-route.tsx`:
```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/your-route')({
  component: YourComponent,
});
```

### For Onboarding Nested Routes
Create new files with the pattern `src/routes/_auth.onboarding.your-step.tsx`:
```typescript
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/onboarding/your-step')({
  component: YourComponent,
});
```

## Route Parameters

- `$organizationId`: Dynamic organization identifier
- `$projectId`: Dynamic project identifier

These parameters are automatically available in the route components via the `useParams()` hook.

## Example Usage

```typescript
import { useParams } from '@tanstack/react-router';

function ProjectDashboard() {
  const { organizationId, projectId } = useParams({
    from: '/_app/$organizationId/$projectId'
  });
  
  // Use organizationId and projectId
}
```

## File Structure

```
src/routes/
├── __root.tsx                           # Root layout
├── index.tsx                            # Landing page
├── _auth.tsx                            # Auth layout (pathless)
├── _auth.login.tsx                      # Login page
├── _auth.onboarding.tsx                 # Onboarding layout
├── _auth.onboarding.index.tsx           # Onboarding main page
├── _auth.onboarding.step1.tsx           # Onboarding step 1
├── _app.tsx                             # App layout (pathless)
├── _app.$organizationId.tsx             # Organization projects list
└── _app.$organizationId.$projectId.tsx  # Project dashboard
```
