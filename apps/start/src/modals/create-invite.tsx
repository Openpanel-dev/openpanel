import { zodResolver } from '@hookform/resolvers/zod';
import { zInviteUser } from '@openpanel/core/modules/organization/organization.constants';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SendIcon } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { ProjectScopePicker } from '@/components/settings/project-scope-picker';
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
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { useTRPC } from '@/integrations/trpc/react';

type IForm = z.infer<typeof zInviteUser>;

export default function CreateInvite() {
  const { t: translateUi } = useDashboardTranslation();

  const { organizationId } = useAppParams();
  const trpc = useTRPC();
  const projectsQuery = useQuery(
    trpc.project.list.queryOptions({
      organizationId,
    })
  );
  const projects = projectsQuery.data ?? [];

  const queryClient = useQueryClient();

  const { register, handleSubmit, formState, reset, control, watch } =
    useForm<IForm>({
      resolver: zodResolver(zInviteUser),
      defaultValues: {
        organizationId,
        projectScope: 'all',
        access: [],
        role: 'member',
      },
    });
  const projectScope = watch('projectScope');
  const isViewer = watch('role') === 'viewer';

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
            <SheetTitle>
              <DashboardText i18nKey={'User has been invited'} />
            </SheetTitle>
          </SheetHeader>
          <div className="prose dark:prose-invert">
            {mutation.data.type === 'is_member' ? (
              <>
                <p>
                  <DashboardText
                    i18nKey={
                      'Since the user already has an account we have added him/her to your organization. This means you will not see this user in the list of invites.'
                    }
                  />{' '}
                </p>
                <p>
                  <DashboardText
                    i18nKey={
                      'We have also notified the user by email about this.'
                    }
                  />
                </p>
              </>
            ) : (
              <p>
                <DashboardText
                  i18nKey={
                    'We have sent an email with instructions to join the organization.'
                  }
                />{' '}
              </p>
            )}
            <div className="row mt-8 gap-4">
              <Button onClick={() => mutation.reset()}>
                <DashboardText i18nKey={'Invite another user'} />{' '}
              </Button>
              <Button onClick={() => closeSheet()} variant="outline">
                <DashboardText i18nKey={'Close'} />{' '}
              </Button>
            </div>
          </div>
        </SheetContent>
      ) : (
        <SheetContent>
          <SheetHeader>
            <div>
              <SheetTitle>
                <DashboardText i18nKey={'Invite a user'} />
              </SheetTitle>
              <SheetDescription>
                <DashboardText
                  i18nKey={
                    'Invite users to your organization. They will receive an email will instructions.'
                  }
                />{' '}
              </SheetDescription>
            </div>
          </SheetHeader>
          <form
            className="flex flex-1 flex-col gap-8"
            onSubmit={handleSubmit((values) => mutation.mutate(values))}
          >
            <InputWithLabel
              className="w-full max-w-sm"
              error={formState.errors.email?.message}
              label={translateUi('Email')}
              placeholder={translateUi('Who do you want to invite?')}
              {...register('email')}
            />
            <div>
              <Label>
                <DashboardText i18nKey={'What role?'} />
              </Label>
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
                      <RadioGroupItem id="member" value="member" />
                      <Label className="mb-0" htmlFor="member">
                        <DashboardText i18nKey={'Member'} />{' '}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="viewer" value="viewer" />
                      <Label className="mb-0" htmlFor="viewer">
                        <DashboardText i18nKey={'Viewer'} />{' '}
                      </Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem id="admin" value="admin" />
                      <Label className="mb-0" htmlFor="admin">
                        <DashboardText i18nKey={'Admin'} />{' '}
                      </Label>
                    </div>
                  </RadioGroup>
                )}
              />
              <p className="mt-1 text-muted-foreground text-sm">
                <DashboardText
                  i18nKey={
                    'Admins manage members and projects. Members can edit the projects they have access to, viewers can only look at them.'
                  }
                />{' '}
              </p>
            </div>
            <Controller
              control={control}
              name="access"
              render={({ field }) => (
                <div>
                  <Label>
                    <DashboardText i18nKey={'Project access'} />
                  </Label>
                  <Controller
                    control={control}
                    name="projectScope"
                    render={({ field: scopeField }) => (
                      <ProjectScopePicker
                        access={field.value}
                        isReadOnly={isViewer}
                        onAccessChange={field.onChange}
                        onScopeChange={scopeField.onChange}
                        projectScope={projectScope}
                        projects={projects}
                      />
                    )}
                  />
                </div>
              )}
            />
            <SheetFooter>
              <Button
                icon={SendIcon}
                loading={mutation.isPending}
                type="submit"
              >
                <DashboardText i18nKey={'Invite user'} />{' '}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      )}
    </>
  );
}
