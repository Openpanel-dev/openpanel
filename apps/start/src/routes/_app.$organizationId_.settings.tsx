import { PageHeader } from '@/components/page-header';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/$organizationId_/settings')({
  component: OrganizationPage,
  // loader: async ({ context, params }) => {
  //   await context.queryClient.prefetchQuery(
  //     context.trpc.project.list.queryOptions({
  //       organizationId: params.organizationId,
  //     }),
  //   );
  // },
});

function OrganizationPage() {
  // const { organizationId } = Route.useParams();
  // const trpc = useTRPC();
  // const { data: projects } = useQuery(
  //   trpc.project.list.queryOptions({
  //     organizationId,
  //   }),
  // );

  // if (!projects?.length) {
  //   return (
  //     <FullPageEmptyState
  //       title="No projects found"
  //       description="Create your first project to get started with analytics."
  //       icon={BoxSelectIcon}
  //     >
  //       <LinkButton icon={PlusIcon} to=".">
  //         Create project
  //       </LinkButton>
  //     </FullPageEmptyState>
  //   );
  // }

  return (
    <div className="container p-8">
      <PageHeader
        title="Workspace settings"
        description="Manage your workspace settings here"
        className="mb-8"
      />

      <div>Workspace settings</div>
    </div>
  );
}
