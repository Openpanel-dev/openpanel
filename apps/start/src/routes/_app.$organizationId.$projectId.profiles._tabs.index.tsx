import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/_tabs/',
)({
  component: Component,
  beforeLoad({ params }) {
    throw redirect({
      to: '/$organizationId/$projectId/profiles/identified',
      params,
    });
  },
});

function Component() {
  return null;
}
