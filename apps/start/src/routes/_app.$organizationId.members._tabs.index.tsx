import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId/members/_tabs/')({
  component: Component,
  beforeLoad: ({ params }) => {
    return redirect({
      to: '/$organizationId/members/members',
      params,
    });
  },
});

function Component() {
  return null;
}
