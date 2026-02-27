import type {
  IServiceClient,
  IServiceEvent,
  IServiceProject,
} from '@openpanel/db';
import { CheckCircle2Icon, CheckIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';
import useWS from '@/hooks/use-ws';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/date';

interface Props {
  project: IServiceProject;
  client: IServiceClient | null;
  events: IServiceEvent[];
  onVerified: (verified: boolean) => void;
}

const VerifyListener = ({ client, events: _events, onVerified }: Props) => {
  const [events, setEvents] = useState<IServiceEvent[]>(_events ?? []);
  useWS<IServiceEvent>(
    `/live/events/${client?.projectId}?type=received`,
    (data) => {
      setEvents((prev) => [...prev, data]);
      onVerified(true);
    }
  );

  const isConnected = events.length > 0;

  const renderIcon = () => {
    if (isConnected) {
      return (
        <CheckCircle2Icon
          className="shrink-0 text-emerald-600"
          size={40}
          strokeWidth={1.2}
        />
      );
    }

    return (
      <Loader2 className="shrink-0 animate-spin text-highlight" size={40} />
    );
  };

  return (
    <div>
      <div
        className={cn(
          'flex gap-6 rounded-xl p-4 md:p-6',
          isConnected ? 'bg-emerald-100 dark:bg-emerald-700' : 'bg-blue-500/10'
        )}
      >
        {renderIcon()}
        <div className="flex-1">
          <div className="font-semibold text-foreground/90 text-lg leading-normal">
            {isConnected ? 'Success' : 'Waiting for events'}
          </div>
          {isConnected ? (
            <div className="flex flex-col-reverse">
              {events.length > 5 && (
                <div className="flex items-center gap-2">
                  <CheckIcon size={14} />{' '}
                  <span>{events.length - 5} more events</span>
                </div>
              )}
              {events.slice(-5).map((event) => (
                <div className="flex items-center gap-2" key={event.id}>
                  <CheckIcon size={14} />{' '}
                  <span className="font-medium">{event.name}</span>{' '}
                  <span className="ml-auto text-emerald-800">
                    {timeAgo(event.createdAt, 'round')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-foreground/50">
              Verify that your implementation works.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyListener;
