import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId_/settings/_tabs/',
)({
  component: Component,
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$organizationId/$projectId/settings/details',
      params,
    });
  },
});

function Component() {
  return null;
}
