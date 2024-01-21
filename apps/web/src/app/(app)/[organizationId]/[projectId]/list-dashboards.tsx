'use client';

import { api, handleErrorToastOptions } from '@/app/_trpc/client';
import { Card, CardActions, CardActionsItem } from '@/components/Card';
import { ToastAction } from '@/components/ui/toast';
import { toast } from '@/components/ui/use-toast';
import { useAppParams } from '@/hooks/useAppParams';
import { pushModal } from '@/modals';
import type { getDashboardsByProjectId } from '@/server/services/dashboard.service';
import { Pencil, Trash } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ListDashboardsProps {
  dashboards: Awaited<ReturnType<typeof getDashboardsByProjectId>>;
}

export function ListDashboards({ dashboards }: ListDashboardsProps) {
  const router = useRouter();
  const params = useAppParams();
  const { organizationId, projectId } = params;
  const deletion = api.dashboard.delete.useMutation({
    onError: (error, variables) => {
      return handleErrorToastOptions({
        action: (
          <ToastAction
            altText="Force delete"
            onClick={() => {
              deletion.mutate({
                forceDelete: true,
                id: variables.id,
              });
            }}
          >
            Force delete
          </ToastAction>
        ),
      })(error);
    },
    onSuccess() {
      router.refresh();
      toast({
        title: 'Success',
        description: 'Dashboard deleted.',
      });
    },
  });

  return (
    <>
      <div className="grid sm:grid-cols-2 gap-4 p-4">
        {dashboards.map((item) => (
          <Card key={item.id} hover>
            <div>
              <Link
                href={`/${organizationId}/${projectId}/${item.id}`}
                className="block p-4 flex flex-col"
              >
                <span className="font-medium">{item.name}</span>
                <span className="text-muted-foreground text-sm">
                  {item.project.name}
                </span>
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
