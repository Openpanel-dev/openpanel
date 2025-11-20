import { ButtonContainer } from '@/components/button-container';
import { Button } from '@/components/ui/button';
import { useTRPC } from '@/integrations/trpc/react';
import { useQuery } from '@tanstack/react-query';
import { UsersIcon } from 'lucide-react';
import { popModal } from '.';
import { ModalContent, ModalHeader } from './Modal/Container';
import type { IChartEvent } from '@openpanel/validation';

interface ViewChartUsersProps {
  projectId: string;
  event: IChartEvent;
  date: string;
  breakdowns?: Array<{ id?: string; name: string }>;
  interval: string;
  startDate: string;
  endDate: string;
  filters?: Array<{
    id?: string;
    name: string;
    operator: string;
    value: Array<string | number | boolean | null>;
  }>;
}

export default function ViewChartUsers({
  projectId,
  event,
  date,
  breakdowns = [],
  interval,
  startDate,
  endDate,
  filters = [],
}: ViewChartUsersProps) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.chart.getProfiles.queryOptions({
      projectId,
      event,
      date,
      breakdowns,
      interval: interval as any,
      startDate,
      endDate,
      filters,
    }),
  );

  const profiles = query.data ?? [];

  return (
    <ModalContent>
      <ModalHeader
        title="View Users"
        description={`Users who triggered this event on ${new Date(date).toLocaleDateString()}`}
      />
      <div className="flex flex-col gap-4">
        {query.isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">Loading users...</div>
          </div>
        ) : profiles.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-muted-foreground">No users found</div>
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <div className="flex flex-col gap-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center gap-3 rounded-lg border p-3"
                >
                  {profile.avatar ? (
                    <img
                      src={profile.avatar}
                      alt={profile.firstName || profile.email}
                      className="size-10 rounded-full"
                    />
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-full bg-muted">
                      <UsersIcon size={20} />
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium">
                      {profile.firstName || profile.lastName
                        ? `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
                        : profile.email || 'Anonymous'}
                    </div>
                    {profile.email && (
                      <div className="text-sm text-muted-foreground">
                        {profile.email}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ButtonContainer>
          <Button type="button" variant="outline" onClick={() => popModal()}>
            Close
          </Button>
        </ButtonContainer>
      </div>
    </ModalContent>
  );
}

