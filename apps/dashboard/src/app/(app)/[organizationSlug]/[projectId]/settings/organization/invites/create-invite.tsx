import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  closeSheet,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
  const { organizationSlug } = useAppParams();

  const { register, handleSubmit, formState, reset, control } = useForm<IForm>({
    resolver: zodResolver(zInviteUser),
    defaultValues: {
      organizationSlug,
      access: [],
      role: 'org:member',
    },
  });

  const mutation = api.organization.inviteUser.useMutation({
    onSuccess() {
      toast('User invited!', {
        description: 'The user has been invited to the organization.',
      });
      reset();
      closeSheet();
      router.refresh();
    },
    onError() {
      toast.error('Failed to invite user');
    },
  });

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button icon={PlusIcon}>Invite user</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Invite a user</SheetTitle>
          <SheetDescription>
            Invite users to your organization. They will recieve an email will
            instructions.
          </SheetDescription>
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
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave empty to give access to all projects
                </p>
              </div>
            )}
          />
          <SheetFooter>
            <Button icon={SendIcon} type="submit" loading={mutation.isLoading}>
              Invite user
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
