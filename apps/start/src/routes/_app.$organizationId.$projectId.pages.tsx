import { PagesTable } from '@/components/pages/table';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { useRangePageContext } from '@/hooks/use-page-context-helpers';
import { PAGE_TITLES, createProjectTitle } from '@/utils/title';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/$organizationId/$projectId/pages')({
  component: Component,
  head: () => ({
    meta: [{ title: createProjectTitle(PAGE_TITLES.PAGES) }],
  }),
});

function Component() {
  const { projectId } = Route.useParams();
  const { t } = useTranslation();
  useRangePageContext('pages');
  return (
    <PageContainer>
      <PageHeader title={t('pages.page_title')} description={t('pages.page_description')} className="mb-8" />
      <PagesTable projectId={projectId} />
    </PageContainer>
  );
}
