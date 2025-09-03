import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId_/$projectId_/profiles/_tabs/',
)({
  component: Component,
  beforeLoad({ params }) {
    return redirect({
      to: '/$organizationId/$projectId/profiles/identified',
      params,
    });
  },
});

function Component() {
  return null;
}
