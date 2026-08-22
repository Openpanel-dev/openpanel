import { ButtonContainer } from '@/components/button-container';
import { SelectDashboard } from '@/components/dashboards/select-dashboard';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearch } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IReport } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type SaveReportProps = {
  report: IReport;
  disableRedirect?: boolean;
};

const validator = z.object({
  name: z.string().min(1, 'Required'),
  dashboardId: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function SaveReport({
  report,
  disableRedirect,
}: SaveReportProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { organizationId, projectId } = useAppParams();
  const searchParams = useSearch({
    from: '/_app/$organizationId/$projectId/reports',
    shouldThrow: false,
  });
  const dashboardId = searchParams?.dashboardId;

  const trpc = useTRPC();
  const save = useMutation(
    trpc.report.create.mutationOptions({
      onError: handleError,
      onSuccess(res) {
        queryClient.invalidateQueries(
          trpc.report.list.queryFilter({
            dashboardId: res.dashboardId,
            projectId,
          }),
        );
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());

        const goToReport = () => {
          router.navigate({
            to: '/$organizationId/$projectId/reports/$reportId',
            params: {
              organizationId,
              projectId,
              reportId: res.id,
            },
            search: searchParams,
          });
        };

        toast('Report created', {
          description: `${res.name}`,
          action: {
            label: 'View report',
            onClick: () => goToReport(),
          },
        });

        if (!disableRedirect) {
          goToReport();
        }

        popModal();
      },
    }),
  );

  const { register, handleSubmit, formState, control, setValue } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        name: report.name,
        dashboardId,
      },
    });

  return (
    <ModalContent>
      <ModalHeader title="Create report" />
      <form
        className="flex flex-col gap-4"
        onSubmit={handleSubmit(({ name, ...values }) => {
          save.mutate({
            report: {
              ...report,
              name,
            },
            ...values,
          });
        })}
      >
        <InputWithLabel
          label="Report name"
          placeholder="Name"
          {...register('name')}
          defaultValue={report.name}
        />
        <Controller
          control={control}
          name="dashboardId"
          render={({ field }) => {
            return (
              <SelectDashboard
                value={field.value}
                onChange={field.onChange}
                projectId={projectId!}
              />
            );
          }}
        />
        <ButtonContainer>
          <Button
            type="button"
            variant="outline"
            onClick={() => popModal()}
            size="default"
          >
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isValid} size="default">
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}

