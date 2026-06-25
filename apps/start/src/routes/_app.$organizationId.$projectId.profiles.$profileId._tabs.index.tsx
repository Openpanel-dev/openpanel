import { createFileRoute, redirect } from '@tanstack/react-router';

// The Overview tab was removed; the profile pane now lives in the left column.
// Landing on a profile defaults to the Events tab.
export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/profiles/$profileId/_tabs/',
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/$organizationId/$projectId/profiles/$profileId/events',
      params,
    });
  },
  component: Component,
});

function Component() {
  return null;
}
