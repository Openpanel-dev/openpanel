import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { ComboboxAdvanced } from '@/components/ui/combobox-advanced';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  closeSheet,
} from '@/components/ui/sheet';
import { useAppParams } from '@/hooks/use-app-params';
import { zodResolver } from '@hookform/resolvers/zod';
import { SendIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';

import { useTRPC } from '@/integrations/trpc/react';
import type { IServiceProject } from '@openpanel/db';
import { zInviteUser } from '@openpanel/validation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

type IForm = z.infer<typeof zInviteUser>;

export default function CreateInvite() {
  const { t } = useTranslation();
  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    }),
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
        toast.success(t('members.invite_success'));
        reset();
        queryClient.invalidateQueries(
          trpc.organization.invitations.queryFilter({ organizationId }),
        );
      },
      onError(error) {
        toast.error(t('members.invite_failed'), {
          description: error.message,
        });
      },
    }),
  );

  return (
    <>
      {mutation.isSuccess ? (
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{t('members.invite_success')}</SheetTitle>
          </SheetHeader>
          <div className="prose dark:prose-invert">
            {mutation.data.type === 'is_member' ? (
              <>
                <p>
                  {t('members.invite_existing_user_description')}
                </p>
                <p>{t('members.invite_existing_user_email_notice')}</p>
              </>
            ) : (
              <p>
                {t('members.invite_email_sent_description')}
              </p>
            )}
            <div className="row gap-4 mt-8">
              <Button onClick={() => mutation.reset()}>
                {t('members.invite_another_user')}
              </Button>
              <Button variant="outline" onClick={() => closeSheet()}>
                {t('common.close')}
              </Button>
            </div>
          </div>
        </SheetContent>
      ) : (
        <SheetContent>
          <SheetHeader>
            <div>
              <SheetTitle>{t('members.invite_user')}</SheetTitle>
              <SheetDescription>
                {t('members.invite_user_description')}
              </SheetDescription>
            </div>
          </SheetHeader>
          <form
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
            className="flex flex-col gap-8"
          >
            <InputWithLabel
              className="w-full max-w-sm"
              label={t('members.email')}
              error={formState.errors.email?.message}
              placeholder={t('members.invite_email_placeholder')}
              {...register('email')}
            />
            <div>
              <Label>{t('members.what_role')}</Label>
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
                        {t('members.role_member')}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="org:admin" id="admin" />
                      <Label className="mb-0" htmlFor="admin">
                        {t('members.role_admin')}
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
                  <Label>{t('members.restrict_access')}</Label>
                  <ComboboxAdvanced
                    placeholder={t('members.restrict_access_placeholder')}
                    value={field.value}
                    onChange={field.onChange}
                    items={projects.map((item) => ({
                      label: item.name,
                      value: item.id,
                    }))}
                  />
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t('members.restrict_access_description')}
                  </p>
                </div>
              )}
            />
            <SheetFooter>
              <Button
                icon={SendIcon}
                type="submit"
                loading={mutation.isPending}
              >
                {t('members.invite_user')}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      )}
    </>
  );
}
