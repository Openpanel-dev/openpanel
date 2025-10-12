import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearch } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IChartProps } from '@openpanel/validation';

import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

type SaveReportProps = {
  report: IChartProps;
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
    from: '/_app/$organizationId/$projectId_/reports',
    shouldThrow: false,
  });
  const dashboardId = searchParams?.dashboardId;

  const trpc = useTRPC();
  const save = useMutation(
    trpc.report.create.mutationOptions({
      onError: handleError,
      onSuccess(res) {
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
  const dashboardMutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onError: handleError,
      onSuccess(res) {
        setValue('dashboardId', res.id);
        dashboardQuery.refetch();
        queryClient.invalidateQueries(trpc.report.list.pathFilter());
        toast('Success', {
          description: 'Dashboard created.',
        });
      },
    }),
  );
  const dashboardQuery = useQuery(
    trpc.dashboard.list.queryOptions({
      projectId: projectId!,
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

  const dashboards = (dashboardQuery.data ?? []).map((item) => ({
    value: item.id,
    label: item.name,
  }));

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
              <div>
                <Label>Dashboard</Label>
                <Combobox
                  {...field}
                  items={dashboards}
                  placeholder="Select a dashboard"
                  searchable
                  onCreate={(value) => {
                    dashboardMutation.mutate({
                      projectId,
                      name: value,
                    });
                  }}
                />
              </div>
            );
          }}
        />
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Cancel
          </Button>
          <Button type="submit" disabled={!formState.isValid}>
            Save
          </Button>
        </ButtonContainer>
      </form>
    </ModalContent>
  );
}
