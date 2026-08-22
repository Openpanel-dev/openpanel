import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { handleError, useTRPC } from '@/integrations/trpc/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

export function SelectDashboard({
  value,
  onChange,
  projectId,
  excludeDashboardId,
}: {
  value: string;
  onChange: (value: string) => void;
  projectId: string;
  excludeDashboardId?: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
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
      projectId,
    }),
  );

  const dashboardMutation = useMutation(
    trpc.dashboard.create.mutationOptions({
      onError: handleError,
      async onSuccess(res) {
        queryClient.invalidateQueries(trpc.dashboard.list.pathFilter());
        await dashboardQuery.refetch();
        onChange(res.id);
        setIsCreatingNew(false);
        setNewDashboardName('');
        form.reset();
      },
    }),
  );

  const handleCreateDashboard = () => {
    if (newDashboardName.trim()) {
      dashboardMutation.mutate({
        name: newDashboardName.trim(),
        projectId,
      });
    }
  };

  const dashboards = (dashboardQuery.data ?? []).filter(
    (dashboard) => dashboard.id !== excludeDashboardId,
  );

  return (
    <div className="space-y-3">
      <Label>Dashboard</Label>

      {!isCreatingNew ? (
        <div className="row gap-2 flex-wrap">
          {dashboards.map((dashboard) => (
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
