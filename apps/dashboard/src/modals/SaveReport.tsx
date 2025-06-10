import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/useAppParams';
import { api, handleError } from '@/trpc/client';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IChartProps } from '@openpanel/validation';

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
  const { organizationId, projectId } = useAppParams();
  const searchParams = useSearchParams();
  const dashboardId = searchParams?.get('dashboardId') ?? undefined;

  const save = api.report.create.useMutation({
    onError: handleError,
    onSuccess(res) {
      const goToReport = () => {
        router.push(
          `/${organizationId}/${projectId}/reports/${
            res.id
          }?${searchParams?.toString()}`,
        );
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
  });

  const { register, handleSubmit, formState, control, setValue } =
    useForm<IForm>({
      resolver: zodResolver(validator),
      defaultValues: {
        name: report.name,
        dashboardId,
      },
    });

  const dashboardMutation = api.dashboard.create.useMutation({
    onError: handleError,
    onSuccess(res) {
      setValue('dashboardId', res.id);
      dashboardQuery.refetch();
      toast('Success', {
        description: 'Dashboard created.',
      });
    },
  });

  const dashboardQuery = api.dashboard.list.useQuery({
    projectId,
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
