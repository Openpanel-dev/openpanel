import { FullPageEmptyState } from '@/components/full-page-empty-state';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { LazyComponent } from '@/components/lazy-component';
import { PageHeader } from '@/components/page-header';
import ProjectCard, {
  ProjectCardSkeleton,
} from '@/components/projects/project-card';
import { Button } from '@/components/ui/button';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import { TableButtons } from '@/components/ui/table';
import { useOrganizationAccess } from '@/hooks/use-organization-access';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { pushModal } from '@/modals';
import { PAGE_TITLES, createOrganizationTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BoxSelectIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const Route = createFileRoute('/_app/$organizationId/')({
  component: OrganizationPage,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.project.list.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
  pendingComponent: FullPageLoadingState,
  head: () => {
    return {
      meta: [
        {
          title: createOrganizationTitle(PAGE_TITLES.PROJECTS),
        },
      ],
    };
  },
});

function OrganizationPage() {
  const { t } = useTranslation();
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { data: projects } = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    }),
  );
  const { isAdmin } = useOrganizationAccess(organizationId);
  const { setSearch, search } = useSearchQueryState();

  if (!projects?.length) {
    return (
      <FullPageEmptyState
        title={t('organization.projects_empty_title')}
        description={
          isAdmin
            ? t('organization.projects_empty_admin_description')
            : t('organization.projects_empty_member_description')
        }
        icon={BoxSelectIcon}
      >
        {isAdmin && (
          <Button icon={PlusIcon} onClick={() => pushModal('AddProject')}>
            {t('organization.create_project')}
          </Button>
        )}
      </FullPageEmptyState>
    );
  }

  return (
    <div className="container p-8">
      <PageHeader
        title={t('organization.projects_page_title')}
        description={t('organization.projects_page_description')}
        className="mb-8"
      />

      <TableButtons>
        <AnimatedSearchInput
          placeholder={t('organization.search_projects')}
          value={search}
          onChange={setSearch}
        />
      </TableButtons>

      <div className="grid gap-6 md:grid-cols-2">
        {projects
          .filter((project) => {
            if (!search) return true;
            return project.name.toLowerCase().includes(search.toLowerCase());
          })
          .map((project, index) => (
            <LazyComponent
              lazy={index >= 6}
              key={project.id}
              fallback={<ProjectCardSkeleton />}
            >
              <ProjectCard {...project} organizationId={organizationId} />
            </LazyComponent>
          ))}
      </div>
    </div>
  );
}
