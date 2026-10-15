import type { IServiceMember } from '@openpanel/core';
import type {
  IProjectAccessGrant,
  ProjectScope,
} from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import { ButtonContainer } from '@/components/button-container';
import { ProjectScopePicker } from '@/components/settings/project-scope-picker';
import { Button } from '@/components/ui/button';
import { handleError, useTRPC } from '@/integrations/trpc/react';

type EditMemberProps = IServiceMember;

export default function EditMember(member: EditMemberProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const toGrants = (): IProjectAccessGrant[] =>
    member.projects.map((row) => ({
      projectId: row.projectId,
      // A null level derives from the role, which is write for everyone but viewers.
      level: row.level === 'read' ? ('read' as const) : ('write' as const),
    }));

  const [projectScope, setProjectScope] = useState<ProjectScope>(
    member.projectScope
  );
  const [access, setAccess] = useState<IProjectAccessGrant[]>(toGrants);

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ organizationId: member.organizationId })
  );

  const mutation = useMutation(
    trpc.organization.updateMemberAccess.mutationOptions({
      onError(error) {
        handleError(error);
        setProjectScope(member.projectScope);
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
        <ProjectScopePicker
          access={access}
          onAccessChange={setAccess}
          onScopeChange={setProjectScope}
          projectScope={projectScope}
          projects={projects}
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
                projectScope,
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
