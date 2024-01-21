'use client';

import { api, handleError } from '@/app/_trpc/client';
import { ButtonContainer } from '@/components/ButtonContainer';
import { InputWithLabel } from '@/components/forms/InputWithLabel';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { useAppParams } from '@/hooks/useAppParams';
import type { IChartInput } from '@/types';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';

interface SaveReportProps {
  report: IChartInput;
  reportId?: string;
}

const validator = z.object({
  name: z.string().min(1, 'Required'),
  dashboardId: z.string().min(1, 'Required'),
});

type IForm = z.infer<typeof validator>;

export default function SaveReport({ report }: SaveReportProps) {
  const router = useRouter();
  const params = useAppParams();
  const organizationId = params.organizationId;
  const projectId = params.projectId;
  const searchParams = useSearchParams();
  const dashboardId = searchParams?.get('dashboardId') ?? undefined;

  const save = api.report.save.useMutation({
    onError: handleError,
    onSuccess(res) {
      toast({
        title: 'Success',
        description: 'Report saved.',
      });
      popModal();
      router.push(
        `/${organizationId}/${projectId}/reports/${
          res.id
        }?${searchParams?.toString()}`
      );
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
      toast({
        title: 'Success',
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
      <ModalHeader title="Edit client" />
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
