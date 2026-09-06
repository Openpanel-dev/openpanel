import type { IServiceMember } from '@openpanel/core';
import type { IProjectAccessGrant } from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { ProjectAccessGrants } from '@/components/settings/project-access-grants';
import { Button } from '@/components/ui/button';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type EditMemberProps = IServiceMember;

export default function EditMember(member: EditMemberProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const toGrants = (): IProjectAccessGrant[] =>
    member.access?.map((a) => ({
      projectId: a.projectId,
      // `admin` is not offered per project - it collapses to write here.
      level: a.level === 'read' ? ('read' as const) : ('write' as const),
    })) ?? [];

  const [access, setAccess] = useState<IProjectAccessGrant[]>(toGrants);

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ organizationId: member.organizationId })
  );

  const mutation = useMutation(
    trpc.organization.updateMemberAccess.mutationOptions({
      onError(error) {
        handleError(error);
        setAccess(toGrants());
      },
      onSuccess() {
        toast.success('Access updated');
        // Refresh members list so access column reflects changes
        queryClient.invalidateQueries(trpc.organization.members.pathFilter());
        popModal();
      },
    })
  );

  const projects = projectsQuery.data ?? [];

  return (
    <ModalContent>
      <ModalHeader
        title={
          member.user
            ? `Edit access for ${[member.user.firstName, member.user.lastName]
                .filter(Boolean)
                .join(' ')}`
            : 'Edit member access'
        }
      />

      <div className="col gap-4">
        <ProjectAccessGrants
          onChange={setAccess}
          projects={projects}
          value={access}
        />

        <ButtonContainer>
          <Button onClick={() => popModal()} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                userId: member.user!.id,
                organizationId: member.organizationId,
                access,
              })
            }
          >
            Save
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}
