import { createFileRoute } from '@tanstack/react-router';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { PagesTable } from '@/components/pages/table';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/$projectId/pages')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.PAGES) }],
  }),
});

function Component() {
  const { projectId } = Route.useParams();
  useRangePageContext('pages');
  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description="Access all your pages here"
        title="Pages"
      />
      <PagesTable projectId={projectId} />
    </PageContainer>
  );
}
