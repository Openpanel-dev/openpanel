import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ProjectAccessGrants } from '@/components/settings/project-access-grants';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { IServiceMember } from '@openpanel/db';
import type { IProjectAccessGrant } from '@openpanel/validation';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type OrgRole = 'org:admin' | 'org:member';

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
  const [role, setRole] = useState<OrgRole>(
    member.role === 'org:admin' ? 'org:admin' : 'org:member',
  );

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ organizationId: member.organizationId }),
  );

  const mutation = useMutation(
    trpc.organization.updateMember.mutationOptions({
      onError(error) {
        handleError(error);
        setAccess(toGrants());
        setRole(member.role === 'org:admin' ? 'org:admin' : 'org:member');
      },
      onSuccess() {
        toast.success('Member updated');
        queryClient.invalidateQueries(trpc.organization.members.pathFilter());
        popModal();
      },
    }),
  );

  const projects = projectsQuery.data ?? [];

  const memberName = member.user
    ? [member.user.firstName, member.user.lastName].filter(Boolean).join(' ')
    : null;

  return (
    <ModalContent>
      <ModalHeader title={memberName ? `Edit ${memberName}` : 'Edit member'} />

      <div className="col gap-4">
        <div>
          <Label id="edit-member-role-label">Organization role</Label>
          <RadioGroup
            aria-labelledby="edit-member-role-label"
            value={role}
            onValueChange={(value) => setRole(value as OrgRole)}
            className="mt-2 flex gap-4"
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem value="org:member" id="edit-member-role" />
              <Label className="mb-0" htmlFor="edit-member-role">
                Member
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="org:admin" id="edit-admin-role" />
              <Label className="mb-0" htmlFor="edit-admin-role">
                Admin
              </Label>
            </div>
          </RadioGroup>
        </div>

        <ProjectAccessGrants
          value={access}
          onChange={setAccess}
          projects={projects}
        />

        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!member.user) {
                return;
              }
              mutation.mutate({
                userId: member.user.id,
                organizationId: member.organizationId,
                role,
                access,
              });
            }}
            disabled={mutation.isPending || !member.user}
          >
            Save
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}
