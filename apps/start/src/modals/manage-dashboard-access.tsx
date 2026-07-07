import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2Icon, UsersIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { popModal, showConfirm } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface ManageDashboardAccessProps {
  dashboardId: string;
  projectId: string;
}

type Level = 'view' | 'edit';

export default function ManageDashboardAccess({
  dashboardId,
  projectId,
}: ManageDashboardAccessProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [addLevel, setAddLevel] = useState<Level>('view');

  const accessQuery = useQuery(
    trpc.dashboard.listAccess.queryOptions({ dashboardId }),
  );
  const membersQuery = useQuery(
    trpc.project.members.queryOptions({ projectId }),
  );

  const invalidate = () => {
    queryClient.invalidateQueries(trpc.dashboard.listAccess.pathFilter());
    queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
  };

  const shareMutation = useMutation(
    trpc.dashboard.share.mutationOptions({
      onError: handleError,
      onSuccess: invalidate,
    }),
  );
  const unshareMutation = useMutation(
    trpc.dashboard.unshare.mutationOptions({
      onError: handleError,
      onSuccess: invalidate,
    }),
  );
  const shareWithAllMutation = useMutation(
    trpc.dashboard.shareWithAllMembers.mutationOptions({
      onError: handleError,
      onSuccess(data) {
        invalidate();
        toast.success(`Shared with ${data.count} member(s)`);
      },
    }),
  );

  const grants = accessQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const grantedUserIds = new Set(grants.map((g) => g.userId));
  const pickableMembers = members.filter((m) => !grantedUserIds.has(m.id));

  const getUserLabel = (user: { firstName?: string | null; lastName?: string | null; email: string }) =>
    [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;

  return (
    <ModalContent>
      <ModalHeader title="Share dashboard" />

      <div className="col gap-4">
        {grants.length > 0 && (
          <div className="col gap-2">
            {grants.map((grant) => (
              <div key={grant.id} className="row items-center gap-2">
                <div className="flex-1 truncate text-sm">
                  {getUserLabel(grant.user)}
                </div>
                <Select
                  value={grant.level}
                  onValueChange={(level) =>
                    shareMutation.mutate({
                      dashboardId,
                      userId: grant.userId,
                      level: level as Level,
                    })
                  }
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="view">Can view</SelectItem>
                    <SelectItem value="edit">Can edit</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  type="button"
                  onClick={() =>
                    unshareMutation.mutate({ dashboardId, userId: grant.userId })
                  }
                >
                  <Trash2Icon size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className="col gap-2">
          <div className="text-muted-foreground text-xs">
            Pick a person below to share it with them immediately.
          </div>
          <div className="row items-center gap-2">
            <Select value={addLevel} onValueChange={(v) => setAddLevel(v as Level)}>
              <SelectTrigger size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="view">Can view</SelectItem>
                <SelectItem value="edit">Can edit</SelectItem>
              </SelectContent>
            </Select>
            <ComboboxAdvanced
              className="flex-1"
              placeholder="Add people"
              value={[]}
              onChange={(value) => {
                const userId = (value as string[]).at(-1);
                if (userId) {
                  shareMutation.mutate({ dashboardId, userId, level: addLevel });
                }
              }}
              items={pickableMembers.map((user) => ({
                label: getUserLabel(user),
                value: user.id,
              }))}
            />
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          icon={UsersIcon}
          disabled={shareWithAllMutation.isPending}
          onClick={() =>
            showConfirm({
              title: 'Share with everyone',
              text: 'This will grant every current member of this project access to this dashboard. Continue?',
              onConfirm: () =>
                shareWithAllMutation.mutate({ dashboardId, level: addLevel }),
            })
          }
        >
          Share with everyone in this project
        </Button>

        <ButtonContainer>
          <Button type="button" onClick={() => popModal()}>
            Done
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}
