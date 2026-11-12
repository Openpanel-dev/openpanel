import { createFileRoute } from '@tanstack/react-router';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { PagesTable } from '@/components/pages/table';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { useTranslation as useDashboardTranslation } from '@/i18n/provider';
import { createProjectTitle, PAGE_TITLES } from '@/utils/title';

export const Route = createFileRoute('/_app/$organizationId/$projectId/pages')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.PAGES) }],
  }),
});

function Component() {
  const { t: translateUi } = useDashboardTranslation();

  const { projectId } = Route.useParams();
  useRangePageContext('pages');
  return (
    <PageContainer>
      <PageHeader
        className="mb-8"
        description={translateUi('Access all your pages here')}
        title={translateUi('Pages')}
      />
      <PagesTable projectId={projectId} />
    </PageContainer>
  );
}
