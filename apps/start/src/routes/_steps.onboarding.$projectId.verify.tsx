import { createFileRoute, redirect } from '@tanstack/react-router';

// The verify step merged into connect; old links and emails still land here.
export const Route = createFileRoute('/_steps/onboarding/$projectId/verify')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/onboarding/$projectId/connect',
      params: { projectId: params.projectId },
    });
  },
});
