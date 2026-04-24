import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/account')({
  beforeLoad: async ({ context }) => {
    const organizations = await context.queryClient
      .fetchQuery(
        context.trpc.organization.list.queryOptions(undefined, {
          staleTime: 0,
          gcTime: 0,
        }),
      )
      .catch(() => []);

    const firstOrg = organizations[0];
    if (!firstOrg) {
      throw redirect({ to: '/onboarding/project' });
    }

    throw redirect({
      to: '/$organizationId/account',
      params: { organizationId: firstOrg.id },
    });
  },
});
