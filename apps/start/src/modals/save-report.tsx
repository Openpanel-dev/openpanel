import { ButtonContainer } from '@/components/button-container';
import { InputWithLabel } from '@/components/forms/input-with-label';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useAppParams } from '@/hooks/use-app-params';
import { handleError } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearch } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

import type { IChartProps } from '@openpanel/validation';

import { Input } from '@/components/ui/input';
import { useTRPC } from '@/integrations/trpc/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { useState } from 'react';
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

function SelectDashboard({
  value,
  onChange,
  projectId,
}: {
  value: string;
  onChange: (value: string) => void;
  projectId: string;
}) {
  const trpc = useTRPC();
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newDashboardName, setNewDashboardName] = useState('');

  const form = useForm({
    resolver: zodResolver(z.object({ name: z.string().min(1, 'Required') })),
    defaultValues: {
      name: '',
    },
  });

  const dashboardQuery = useQuery(
    trpc.dashboard.list.queryOptions({
      projectId: projectId!,
    }),
  );

  const dashboardMutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onError: handleError,
      async onSuccess(res) {
        await dashboardQuery.refetch();
        onChange(res.id);
        setIsCreatingNew(false);
        setNewDashboardName('');
        form.reset();
      },
    }),
  );

  const handleSelectChange = (selectedValue: string) => {
    if (selectedValue === 'create-new') {
      setIsCreatingNew(true);
      onChange(''); // Clear the current selection
    } else {
      setIsCreatingNew(false);
      onChange(selectedValue);
    }
  };

  const handleCreateDashboard = () => {
    if (newDashboardName.trim()) {
      dashboardMutation.mutate({
        name: newDashboardName.trim(),
        projectId,
      });
    }
  };

  const selectedDashboard = dashboardQuery.data?.find((d) => d.id === value);

  return (
    <div className="space-y-3">
      <Label>Dashboard</Label>

      {!isCreatingNew ? (
        <div className="row gap-2 flex-wrap">
          {dashboardQuery.data?.map((dashboard) => (
            <Button
              type="button"
              key={dashboard.id}
              variant={value === dashboard.id ? 'default' : 'outline'}
              onClick={() => onChange(dashboard.id)}
            >
              {dashboard.name}
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setIsCreatingNew(true);
              onChange('');
            }}
            icon={PlusIcon}
          >
            Create new dashboard
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            icon={ArrowLeftIcon}
            onClick={() => {
              setIsCreatingNew(false);
              setNewDashboardName('');
              form.reset();
            }}
          />
          <Input
            placeholder="Enter dashboard name"
            value={newDashboardName}
            onChange={(e) => setNewDashboardName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreateDashboard();
              }
            }}
          />
          <Button
            type="button"
            onClick={handleCreateDashboard}
            disabled={!newDashboardName.trim() || dashboardMutation.isPending}
            variant="outline"
            icon={SaveIcon}
          >
            {dashboardMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      )}
    </div>
  );
}
