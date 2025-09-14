import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { useTRPC } from '@/integrations/trpc/react';
import { handleError } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { IServiceMember } from '@openpanel/db';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type EditMemberProps = IServiceMember;

export default function EditMember(member: EditMemberProps) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();

  const [access, setAccess] = useState<string[]>(
    member.access?.map((a) => a.projectId) ?? [],
  );

  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({ organizationId: member.organizationId }),
  );

  const mutation = useMutation(
    trpc.organization.updateMemberAccess.mutationOptions({
      onError(error) {
        handleError(error);
        setAccess(member.access?.map((a) => a.projectId) ?? []);
      },
      onSuccess() {
        toast.success('Access updated');
        // Refresh members list so access column reflects changes
        queryClient.invalidateQueries(trpc.organization.members.pathFilter());
        popModal();
      },
    }),
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
        <ComboboxAdvanced
          placeholder="Restrict access to projects"
          value={access}
          onChange={(newAccess) => setAccess(newAccess as string[])}
          items={projects.map((p) => ({ label: p.name, value: p.id }))}
        />

        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mutation.mutate({
                userId: member.user!.id,
                organizationId: member.organizationId,
                access: access,
              })
            }
            disabled={mutation.isPending}
          >
            Save
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}
