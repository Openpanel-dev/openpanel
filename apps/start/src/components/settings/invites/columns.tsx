import { Badge } from '@/components/ui/badge';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { toast } from 'sonner';

import { ColumnCreatedAt } from '@/components/column-created-at';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import type { RouterOutputs } from '@/trpc/client';
import { clipboard } from '@/utils/clipboard';
import { useTranslation } from 'react-i18next';

export function useColumns(): ColumnDef<
  RouterOutputs['organization']['invitations'][number]
>[] {
  const { t } = useTranslation();

  return [
    {
      accessorKey: 'id',
    },
    {
      accessorKey: 'email',
      header: t('settings.invite_mail_column'),
      cell: ({ row }) => (
        <div className="font-medium">{row.original.email}</div>
      ),
      meta: {
        label: t('settings.invite_email_label'),
        placeholder: t('settings.invite_search_email_placeholder'),
        variant: 'text',
      },
    },
    {
      accessorKey: 'role',
      header: t('settings.invite_role_column'),
      meta: {
        label: t('settings.invite_role_column'),
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('settings.invite_created_column'),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
      meta: {
        label: t('settings.invite_created_column'),
      },
    },
    {
      accessorKey: 'projectAccess',
      header: t('settings.invite_access_column'),
      cell: ({ row }) => {
        return <AccessCell row={row} />;
      },
      meta: {
        label: t('settings.invite_access_column'),
      },
    },
    createActionColumn(({ row }) => {
      const trpc = useTRPC();
      const queryClient = useQueryClient();
      const revoke = useMutation(
        trpc.organization.revokeInvite.mutationOptions({
          onSuccess() {
            toast.success(
              t('settings.invite_revoked_toast', {
                email: row.original.email,
              }),
            );
            queryClient.invalidateQueries(
              trpc.organization.invitations.queryFilter({
                organizationId: row.original.organizationId,
              }),
            );
          },
          onError() {
            toast.error(
              t('settings.invite_revoke_failed_toast', {
                email: row.original.email,
              }),
            );
          },
        }),
      );

      return (
        <>
          <DropdownMenuItem
            onClick={() => {
              clipboard(
                `${window.location.origin}/onboarding?inviteId=${row.original.id}`,
              );
            }}
          >
            {t('settings.invite_copy_link')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              revoke.mutate({ inviteId: row.original.id });
            }}
          >
            {t('settings.invite_revoke')}
          </DropdownMenuItem>
        </>
      );
    }),
  ];
}

function AccessCell({
  row,
}: {
  row: Row<RouterOutputs['organization']['invitations'][number]>;
}) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId: row.original.organizationId,
    }),
  );
  const projects = projectsQuery.data ?? [];
  const access = row.original.projectAccess ?? [];

  return (
    <>
      {access.map((id) => {
        const project = projects.find((p) => p.id === id);
        if (!project) {
          return (
            <Badge key={id} className="mr-1">
              {t('settings.invite_unknown_project')}
            </Badge>
          );
        }
        return (
          <Badge key={id} color="blue" className="mr-1">
            {project.name}
          </Badge>
        );
      })}
      {access.length === 0 && (
        <Badge variant={'secondary'}>{t('settings.invite_all_projects')}</Badge>
      )}
    </>
  );
}
