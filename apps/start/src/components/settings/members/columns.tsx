import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

import { ColumnCreatedAt } from '@/components/column-created-at';
import { Badge } from '@/components/ui/badge';
import { createActionColumn } from '@/components/ui/data-table/data-table-helpers';
import { pushModal } from '@/modals';
import type { IServiceMember } from '@openpanel/db';
import { useTranslation } from 'react-i18next';

export function useColumns() {
  const { t } = useTranslation();
  const columns: ColumnDef<IServiceMember>[] = [
    {
      accessorKey: 'user',
      header: t('settings.members_name_column'),
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) return null;
        return [user.firstName, user.lastName].filter(Boolean).join(' ');
      },
      meta: {
        label: t('settings.members_name_column'),
      },
    },
    {
      accessorKey: 'email',
      header: t('settings.members_email_column'),
      cell: ({ row }) => {
        const user = row.original.user;
        if (!user) return null;
        return <div className="font-medium">{user.email}</div>;
      },
      meta: {
        label: t('settings.members_email_column'),
        placeholder: t('settings.members_search_email_placeholder'),
        variant: 'text',
      },
    },
    {
      accessorKey: 'role',
      header: t('settings.members_role_column'),
      cell: ({ row }) => {
        const role = row.original.role;
        return <Badge variant={'outline'}>{role}</Badge>;
      },
      meta: {
        label: t('settings.members_role_column'),
      },
    },
    {
      accessorKey: 'createdAt',
      header: t('settings.members_created_column'),
      size: ColumnCreatedAt.size,
      cell: ({ row }) => {
        const item = row.original;
        return <ColumnCreatedAt>{item.createdAt}</ColumnCreatedAt>;
      },
      meta: {
        label: t('settings.members_created_column'),
      },
    },
    {
      accessorKey: 'access',
      header: t('settings.members_access_column'),
      cell: ({ row }) => {
        const access = row.original.access ?? [];
        if (access.length === 0) {
          return (
            <div className="text-muted-foreground">
              {t('settings.members_all_projects')}
            </div>
          );
        }
        return (
          <div className="row flex-wrap gap-2">
            {row.original.access?.map((item) => (
              <Badge variant={'outline'} key={item.projectId}>
                {item.projectId}
              </Badge>
            ))}
          </div>
        );
      },
      meta: {
        label: t('settings.members_access_column'),
      },
    },
    createActionColumn(({ row }) => {
      const queryClient = useQueryClient();
      const trpc = useTRPC();
      const revoke = useMutation(
        trpc.organization.removeMember.mutationOptions({
          onSuccess() {
            toast.success(
              t('settings.members_removed_toast', {
                name: row.original.user?.firstName,
              }),
            );
            queryClient.invalidateQueries(
              trpc.organization.members.pathFilter(),
            );
          },
          onError() {
            toast.error(
              t('settings.members_remove_failed_toast', {
                name: row.original.user?.firstName,
              }),
            );
          },
        }),
      );

      return (
        <>
          <DropdownMenuItem
            onClick={() => {
              pushModal('EditMember', row.original);
            }}
          >
            {t('settings.members_edit_access')}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive"
            onClick={() => {
              revoke.mutate({
                organizationId: row.original.organizationId,
                userId: row.original.userId!,
                id: row.original.id,
              });
            }}
          >
            {t('settings.members_remove_member')}
          </DropdownMenuItem>
        </>
      );
    }),
  ];

  return columns;
}
