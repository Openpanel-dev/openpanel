import { createFileRoute } from '@tanstack/react-router';
import { AiGenerationsTable } from '@/components/ai/ai-generations-table';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/ai/_tabs/generations'
)({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.AI_GENERATIONS) }],
  }),
});

function Component() {
  const { projectId } = Route.useParams();
  return <AiGenerationsTable projectId={projectId} />;
}
