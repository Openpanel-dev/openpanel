'use client';

import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  closeSheet,
} from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/useAppParams';
import { api } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, SendIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';

import type { IServiceProject } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';

type IForm = z.infer<typeof zInviteUser>;

interface Props {
  projects: IServiceProject[];
}

export default function CreateInvite({ projects }: Props) {
  const router = useRouter();
  const { organizationId } = useAppParams();

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    resolver: zodResolver(zInviteUser),
    defaultValues: {
      organizationId,
      access: [],
      role: 'org:member',
    },
  });

  const mutation = api.organization.inviteUser.useMutation({
    onSuccess() {
      toast.success('User has been invited');
      reset();
      router.refresh();
    },
    onError(error) {
      toast.error('Failed to invite user', {
        description: error.message,
      });
    },
  });

  return (
    <Sheet onOpenChange={() => mutation.reset()}>
      <SheetTrigger asChild>
        <Button icon={PlusIcon}>Invite user</Button>
      </SheetTrigger>
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
            <div className="row gap-4 mt-8">
              <Button onClick={() => mutation.reset()}>
                Invite another user
              </Button>
              <Button variant="outline" onClick={() => closeSheet()}>
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
                Invite users to your organization. They will recieve an email
                will instructions.
              </SheetDescription>
            </div>
          </SheetHeader>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-8"
          >
            <InputWithLabel
              className="w-full max-w-sm"
              label="Email"
              error={formState.errors.email?.message}
              placeholder="Who do you want to invite?"
              {...register('email')}
            />
            <div>
              <Label>What role?</Label>
              <Controller
                name="role"
                control={control}
                render={({ field }) => (
                  <RadioGroup
                    defaultValue={field.value}
                    onChange={field.onChange}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="org:member" id="member" />
                      <Label className="mb-0" htmlFor="member">
                        Member
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="org:admin" id="admin" />
                      <Label className="mb-0" htmlFor="admin">
                        Admin
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />
            </div>
            <Controller
              name="access"
              control={control}
              render={({ field }) => (
                <div>
                  <Label>Restrict access</Label>
                  <ComboboxAdvanced
                    placeholder="Restrict access to projects"
                    value={field.value}
                    onChange={field.onChange}
                    items={projects.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Leave empty to give access to all projects
                  </p>
                </div>
              )}
            />
            <SheetFooter>
              <Button
                icon={SendIcon}
                type="submit"
                loading={mutation.isLoading}
              >
                Invite user
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      )}
    </Sheet>
  );
}
