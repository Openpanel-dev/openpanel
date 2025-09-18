import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { LazyComponent } from '@/components/lazy-component';
import { PageHeader } from '@/components/page-header';
import ProjectCard, {
  ProjectCardSkeleton,
} from '@/components/projects/project-card';
import { LinkButton } from '@/components/ui/button';
import { AnimatedSearchInput } from '@/components/ui/data-table/data-table-toolbar';
import { TableButtons } from '@/components/ui/table';
import { useSearchQueryState } from '@/hooks/use-search-query-state';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { BoxSelectIcon, PlusIcon } from 'lucide-react';

export const Route = createFileRoute('/_app/$organizationId/')({
  component: OrganizationPage,
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(
      context.trpc.project.list.queryOptions({
        organizationId: params.organizationId,
      }),
    );
  },
});

function OrganizationPage() {
  const { organizationId } = Route.useParams();
  const trpc = useTRPC();
  const { data: projects } = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    }),
  );
  const { debouncedSearch, setSearch, search } = useSearchQueryState();

  if (!projects?.length) {
    return (
      <FullPageEmptyState
        title="No projects found"
        description="Create your first project to get started with analytics."
        icon={BoxSelectIcon}
      >
        <LinkButton icon={PlusIcon} to=".">
          Create project
        </LinkButton>
      </FullPageEmptyState>
    );
  }

  return (
    <div className="container p-8">
      <PageHeader
        title="Projects"
        description="All your projects in this workspace"
        className="mb-8"
      />

      <TableButtons>
        <AnimatedSearchInput
          placeholder="Search projects"
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
