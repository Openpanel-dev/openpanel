import type { IServiceEvent } from '@openpanel/db';
import { CheckCircle2Icon, CheckIcon, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { timeAgo } from '@/utils/date';
import { useTranslation } from 'react-i18next';

interface Props {
  events: IServiceEvent[];
}

const VerifyListener = ({ events }: Props) => {
  const { t } = useTranslation();
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
          isConnected
            ? 'bg-emerald-100 dark:bg-emerald-700/10'
            : 'bg-blue-500/10'
        )}
      >
        {renderIcon()}
        <div className="flex-1">
          <div className="font-semibold text-foreground/90 text-lg leading-normal">
            {isConnected
              ? t('onboarding.verify_connected_title')
              : t('onboarding.verify_waiting_title')}
          </div>
          {isConnected ? (
            <div className="mt-2 flex flex-col-reverse gap-1">
              {events.length > 5 && (
                <div className="flex items-center gap-2">
                  <CheckIcon size={14} />{' '}
                  <span>
                    {t('onboarding.verify_more_events', {
                      count: events.length - 5,
                    })}
                  </span>
                </div>
              )}
              {events.slice(-5).map((event) => (
                <div className="flex items-center gap-2" key={event.id}>
                  <CheckIcon size={14} />{' '}
                  <span className="font-medium">{event.name}</span>{' '}
                  <span className="ml-auto text-foreground/50 text-sm">
                    {timeAgo(event.createdAt, 'round')}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-foreground/50">
              {t('onboarding.verify_waiting_description')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VerifyListener;
