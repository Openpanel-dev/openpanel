import type { IServiceEvent, IServiceEventMinimal } from '@openpanel/db';
import { Link } from '@tanstack/react-router';
import { SerieIcon } from '../report-chart/common/serie-icon';
import { EventIcon } from './event-icon';
import { Tooltiper } from '@/components/ui/tooltip';
import { useAppParams } from '@/hooks/use-app-params';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { getProfileName } from '@/utils/getters';

type EventListItemProps = IServiceEventMinimal | IServiceEvent;

export function EventListItem(props: EventListItemProps) {
  const { organizationId, projectId } = useAppParams();
  const { createdAt, name, path, meta } = props;
  const profile = 'profile' in props ? props.profile : null;

  const renderName = () => {
    if (name === 'screen_view') {
      if (path.includes('/')) {
        return path;
      }

      return `Route: ${path}`;
    }

    return name.replace(/_/g, ' ');
  };

  const isMinimal = 'minimal' in props;

  return (
    <button
      className={cn(
        'card flex w-full items-center justify-between rounded-lg p-4 transition-colors hover:bg-light-background',
        meta?.conversion &&
          `bg-${meta.color}-50 dark:bg-${meta.color}-900 hover:bg-${meta.color}-100 dark:hover:bg-${meta.color}-700`
      )}
      onClick={() => {
        if (!isMinimal) {
          pushModal('EventDetails', {
            id: props.id,
            projectId,
            createdAt,
          });
        }
      }}
      type="button"
    >
      <div>
        <div className="flex items-center gap-4 text-left">
          <EventIcon meta={meta} name={name} size="sm" />
          <span className="font-medium">{renderName()}</span>
        </div>
        <div className="pl-10">
          <div className="flex origin-left scale-75 gap-1">
            <SerieIcon name={props.country} />
            <SerieIcon name={props.os} />
            <SerieIcon name={props.browser} />
          </div>
        </div>
      </div>
      <div className="flex gap-4">
        {profile && (
          <Tooltiper asChild content={getProfileName(profile)}>
            <Link
              className="max-w-[80px] overflow-hidden text-ellipsis whitespace-nowrap text-muted-foreground hover:underline"
              onClick={(e) => {
                e.stopPropagation();
              }}
              params={{
                organizationId,
                projectId,
                profileId: profile.id,
              }}
              to={'/$organizationId/$projectId/profiles/$profileId'}
            >
              {getProfileName(profile)}
            </Link>
          </Tooltiper>
        )}

        <Tooltiper asChild content={createdAt.toLocaleString()}>
          <div className="text-muted-foreground">
            {createdAt.toLocaleTimeString()}
          </div>
        </Tooltiper>
      </div>
    </button>
  );
}
