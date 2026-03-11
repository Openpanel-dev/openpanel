import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import {
  createFileRoute,
  Outlet,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import { Building2Icon, PencilIcon, Trash2Icon } from 'lucide-react';
import FullPageLoadingState from '@/components/full-page-loading-state';
import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePageTabs } from '@/hooks/use-page-tabs';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { pushModal, showConfirm } from '@/modals';
import { createProjectTitle } from '@/utils/title';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/groups_/$groupId/_tabs'
)({
  component: Component,
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.prefetchQuery(
        context.trpc.group.byId.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
      context.queryClient.prefetchQuery(
        context.trpc.group.metrics.queryOptions({
          id: params.groupId,
          projectId: params.projectId,
        })
      ),
    ]);
  },
  pendingComponent: FullPageLoadingState,
  head: () => ({
    meta: [{ title: createProjectTitle('Group') }],
  }),
});

function Component() {
  const router = useRouter();
  const { projectId, organizationId, groupId } = Route.useParams();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const group = useSuspenseQuery(
    trpc.group.byId.queryOptions({ id: groupId, projectId })
  );

  const deleteMutation = useMutation(
    trpc.group.delete.mutationOptions({
      onSuccess() {
        queryClient.invalidateQueries(trpc.group.list.pathFilter());
        navigate({
          to: '/$organizationId/$projectId/groups',
          params: { organizationId, projectId },
        });
      },
      onError: handleError,
    })
  );

  const { activeTab, tabs } = usePageTabs([
    { id: '/$organizationId/$projectId/groups/$groupId', label: 'Overview' },
    { id: 'members', label: 'Members' },
    { id: 'events', label: 'Events' },
  ]);

  const handleTabChange = (tabId: string) => {
    router.navigate({
      from: Route.fullPath,
      to: tabId,
    });
  };

  const g = group.data;

  if (!g) {
    return (
      <PageContainer>
        <div className="flex flex-col items-center justify-center gap-3 py-24 text-muted-foreground">
          <Building2Icon className="size-10 opacity-30" />
          <p className="text-sm">Group not found</p>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="col">
      <PageHeader
        actions={
          <div className="row gap-2">
            <Button
              onClick={() =>
                pushModal('EditGroup', {
                  id: g.id,
                  projectId: g.projectId,
                  name: g.name,
                  type: g.type,
                  properties: g.properties,
                })
              }
              size="sm"
              variant="outline"
            >
              <PencilIcon className="mr-2 size-4" />
              Edit
            </Button>
            <Button
              onClick={() =>
                showConfirm({
                  title: 'Delete group',
                  text: `Are you sure you want to delete "${g.name}"? This action cannot be undone.`,
                  onConfirm: () =>
                    deleteMutation.mutate({ id: g.id, projectId }),
                })
              }
              size="sm"
              variant="outline"
            >
              <Trash2Icon className="mr-2 size-4" />
              Delete
            </Button>
          </div>
        }
        title={
          <div className="row min-w-0 items-center gap-3">
            <Building2Icon className="size-6 shrink-0" />
            <span className="truncate">{g.name}</span>
          </div>
        }
      />

      <Tabs
        className="mt-2 mb-8"
        onValueChange={handleTabChange}
        value={activeTab}
      >
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Outlet />
    </PageContainer>
  );
}
