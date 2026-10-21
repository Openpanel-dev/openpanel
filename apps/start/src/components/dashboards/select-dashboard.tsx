import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftIcon, PlusIcon, SaveIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { handleError, useTRPC } from '@/integrations/trpc/react';

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
  const [previousValue, setPreviousValue] = useState('');
  const newDashboardNameId = useId();

  const dashboardQuery = useQuery(
    trpc.dashboard.list.queryOptions({
      projectId,
    })
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
      },
    })
  );

  const handleCreateDashboard = () => {
    const name = newDashboardName.trim();
    if (!name || dashboardMutation.isPending) {
      return;
    }

    dashboardMutation.mutate({
      name,
      projectId,
    });
  };

  const dashboards = (dashboardQuery.data ?? []).filter(
    (dashboard) => dashboard.id !== excludeDashboardId
  );

  return (
    <div className="space-y-3">
      <Label htmlFor={isCreatingNew ? newDashboardNameId : undefined}>
        Dashboard
      </Label>

      {isCreatingNew ? (
        <div className="flex gap-2">
          <Button
            aria-label="Back to dashboard selection"
            icon={ArrowLeftIcon}
            onClick={() => {
              setIsCreatingNew(false);
              setNewDashboardName('');
              onChange(previousValue);
            }}
            size="icon"
            type="button"
            variant="outline"
          />
          <Input
            id={newDashboardNameId}
            onChange={(e) => setNewDashboardName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') {
                return;
              }
              // Enter confirms an IME candidate, it should not submit.
              if (e.nativeEvent.isComposing || e.keyCode === 229) {
                return;
              }
              e.preventDefault();
              handleCreateDashboard();
            }}
            placeholder="Enter dashboard name"
            value={newDashboardName}
          />
          <Button
            disabled={!newDashboardName.trim() || dashboardMutation.isPending}
            icon={SaveIcon}
            onClick={handleCreateDashboard}
            type="button"
            variant="outline"
          >
            {dashboardMutation.isPending ? 'Creating...' : 'Create'}
          </Button>
        </div>
      ) : (
        <div className="row flex-wrap gap-2">
          {dashboards.map((dashboard) => (
            <Button
              aria-pressed={value === dashboard.id}
              key={dashboard.id}
              onClick={() => onChange(dashboard.id)}
              type="button"
              variant={value === dashboard.id ? 'default' : 'outline'}
            >
              {dashboard.name}
            </Button>
          ))}
          <Button
            icon={PlusIcon}
            onClick={() => {
              setPreviousValue(value);
              setIsCreatingNew(true);
              onChange('');
            }}
            type="button"
            variant="outline"
          >
            Create new dashboard
          </Button>
        </div>
      )}
    </div>
  );
}
