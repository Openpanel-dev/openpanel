import { createFileRoute } from '@tanstack/react-router';
import { AiTracesTable } from '@/components/ai/ai-traces-table';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ai/_tabs/traces'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.AI_TRACES) }],
  }),
});

function Component() {
  const { projectId } = Route.useParams();
  return <AiTracesTable projectId={projectId} />;
}
