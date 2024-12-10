'use client';

import { Badge } from '@/components/ui/badge';
import useWS from '@/hooks/useWS';
import { pushModal } from '@/modals';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/date';
import { CheckCircle2Icon, CheckIcon, Loader2 } from 'lucide-react';
import { useState } from 'react';

import type {
  IServiceClient,
  IServiceEvent,
  IServiceProject,
} from '@openpanel/db';

type Props = {
  project: IServiceProject;
  client: IServiceClient | null;
  events: IServiceEvent[];
  onVerified: (verified: boolean) => void;
};

const VerifyListener = ({ client, events: _events, onVerified }: Props) => {
  const [events, setEvents] = useState<IServiceEvent[]>(_events ?? []);
  useWS<IServiceEvent>(
    `/live/events/${client?.projectId}?type=received`,
    (data) => {
      setEvents((prev) => [...prev, data]);
      onVerified(true);
    },
  );

  const isConnected = events.length > 0;

  const renderIcon = () => {
    if (isConnected) {
      return (
        <CheckCircle2Icon
          strokeWidth={1.2}
          size={40}
          className="shrink-0 text-emerald-600"
        />
      );
    }

    return (
      <Loader2 size={40} className="shrink-0 animate-spin text-highlight" />
    );
  };

  return (
    <div className="rounded-lg border p-4 md:p-6">
      <div className="flex items-center gap-2 text-2xl capitalize">
        {client?.name}
      </div>

      <div
        className={cn(
          'my-6 flex gap-6 rounded-xl p-4 md:p-6',
          isConnected
            ? 'bg-emerald-100 dark:bg-emerald-700'
            : 'bg-blue-100 dark:bg-blue-700',
        )}
      >
        {renderIcon()}
        <div className="flex-1">
          <div className="text-lg font-semibold leading-normal">
            {isConnected ? 'Success' : 'Waiting for events'}
          </div>
          {isConnected ? (
            <div className="flex flex-col-reverse">
              {events.length > 5 && (
                <div className="flex items-center gap-2 ">
                  <CheckIcon size={14} />{' '}
                  <span>{events.length - 5} more events</span>
                </div>
              )}
              {events.slice(-5).map((event, index) => (
                <div key={event.id} className="flex items-center gap-2 ">
                  <CheckIcon size={14} />{' '}
                  <span className="font-medium">{event.name}</span>{' '}
                  <span className="ml-auto text-emerald-800">
                    {timeAgo(event.createdAt, 'round')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="">
              Verify that your events works before submitting any changes to App
              Store/Google Play
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 text-sm text-muted-foreground">
        You can{' '}
        <button
          type="button"
          className="underline"
          onClick={() => {
            pushModal('OnboardingTroubleshoot', {
              client,
              type: 'app',
            });
          }}
        >
          troubleshoot
        </button>{' '}
        if you are having issues connecting your app.
      </div>
    </div>
  );
};

export default VerifyListener;
