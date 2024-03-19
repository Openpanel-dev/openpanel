'use client';

import { api, handleErrorToastOptions } from '@/app/_trpc/client';
import { Card, CardActions, CardActionsItem } from '@/components/card';
import { FullPageEmptyState } from '@/components/full-page-empty-state';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import { LayoutPanelTopIcon, Pencil, PlusIcon, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import type { IServiceDashboards } from '@openpanel/db';

interface ListDashboardsProps {
  dashboards: IServiceDashboards;
}

export function ListDashboards({ dashboards }: ListDashboardsProps) {
  const router = useRouter();
  const params = useAppParams();
  const { organizationId, projectId } = params;
  const deletion = api.dashboard.delete.useMutation({
    onError: (error, variables) => {
      return handleErrorToastOptions({
        action: {
          label: 'Force delete',
          onClick: () => {
            deletion.mutate({
              forceDelete: true,
              id: variables.id,
            });
          },
        },
      })(error);
    },
    onSuccess() {
      router.refresh();
      toast('Success', {
        description: 'Dashboard deleted.',
      });
    },
  });

  if (dashboards.length === 0) {
    return (
      <FullPageEmptyState title="No dashboards" icon={LayoutPanelTopIcon}>
        <p>You have not created any dashboards for this project yet</p>
        <Button
          onClick={() => pushModal('AddDashboard')}
          className="mt-14"
          icon={PlusIcon}
        >
          Create dashboard
        </Button>
      </FullPageEmptyState>
    );
  }

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4 p-4">
        {dashboards.map((item) => (
          <Card key={item.id} hover>
            <div>
              <Link
                href={`/${organizationId}/${projectId}/dashboards/${item.id}`}
                className="block p-4 flex flex-col"
              >
                <span className="font-medium">{item.name}</span>
              </Link>
            </div>

            <CardActions>
              <CardActionsItem className="w-full" asChild>
                <button
                  onClick={() => {
                    pushModal('EditDashboard', item);
                  }}
                >
                  <Pencil size={16} />
                  Edit
                </button>
              </CardActionsItem>
              <CardActionsItem className="text-destructive w-full" asChild>
                <button
                  onClick={() => {
                    deletion.mutate({
                      id: item.id,
                    });
                  }}
                >
                  <Trash size={16} />
                  Delete
                </button>
              </CardActionsItem>
            </CardActions>
          </Card>
        ))}
      </div>
    </>
  );
}
