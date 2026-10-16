import { zodResolver } from '@hookform/resolvers/zod';
import { zInviteUser } from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { ProjectAccessGrants } from '@/components/settings/project-access-grants';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  closeSheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';

type IForm = z.infer<typeof zInviteUser>;

export default function CreateInvite() {
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    })
  );
  const projects = projectsQuery.data ?? [];

  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    resolver: zodResolver(zInviteUser),
    defaultValues: {
      organizationId,
      access: [],
      role: 'org:member',
    },
  });

  const mutation = useMutation(
    trpc.organization.inviteUser.mutationOptions({
      onSuccess() {
        toast.success('User has been invited');
        reset();
        queryClient.invalidateQueries(
          trpc.organization.invitations.queryFilter({ organizationId })
        );
      },
      onError(error) {
        toast.error('Failed to invite user', {
          description: error.message,
        });
      },
    })
  );

  return (
    <>
      {mutation.isSuccess ? (
        <SheetContent>
          <SheetHeader>
            <SheetTitle>User has been invited</SheetTitle>
          </SheetHeader>
          <div className="prose dark:prose-invert">
            {mutation.data.type === 'is_member' ? (
              <>
                <p>
                  Since the user already has an account we have added him/her to
                  your organization. This means you will not see this user in
                  the list of invites.
                </p>
                <p>We have also notified the user by email about this.</p>
              </>
            ) : (
              <p>
                We have sent an email with instructions to join the
                organization.
              </p>
            )}
            <div className="row mt-8 gap-4">
              <Button onClick={() => mutation.reset()}>
                Invite another user
              </Button>
              <Button onClick={() => closeSheet()} variant="outline">
                Close
              </Button>
            </div>
          </div>
        </SheetContent>
      ) : (
        <SheetContent>
          <SheetHeader>
            <div>
              <SheetTitle>Invite a user</SheetTitle>
              <SheetDescription>
                Invite users to your organization. They will receive an email
                will instructions.
              </SheetDescription>
            </div>
          </SheetHeader>
          <form
            className="flex flex-col gap-8"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            <InputWithLabel
              className="w-full max-w-sm"
              error={formState.errors.email?.message}
              label="Email"
              placeholder="Who do you want to invite?"
              {...register('email')}
            />
            <div>
              <Label>What role?</Label>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <RadioGroup
                    className="flex gap-4"
                    defaultValue={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                    ref={field.ref}
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="member" value="org:member" />
                      <Label className="mb-0" htmlFor="member">
                        Member
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="admin" value="org:admin" />
                      <Label className="mb-0" htmlFor="admin">
                        Admin
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />
            </div>
            <Controller
              control={control}
              name="access"
              render={({ field }) => (
                <div>
                  <Label>Restrict access</Label>
                  <ProjectAccessGrants
                    onChange={field.onChange}
                    projects={projects}
                    value={field.value}
                  />
                  <p className="mt-1 text-muted-foreground text-sm">
                    Leave empty to give access to all projects
                  </p>
                </div>
              )}
            />
            <SheetFooter>
              <Button
                icon={SendIcon}
                loading={mutation.isPending}
                type="submit"
              >
                Invite user
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      )}
    </>
  );
}
