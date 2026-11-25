import { ZapIcon } from 'lucide-react';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';
import { EmptyState } from '@/components/empty-state';
import { Widget } from '@/components/widget';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';

interface Props {
  data: { count: number; name: string }[];
}

export const MostEvents = ({ data }: Props) => {
  const { t: translateUi } = useDashboardTranslation();

  const max = data.length > 0 ? Math.max(...data.map((item) => item.count)) : 0;
  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>
          <DashboardText i18nKey={'Popular events'} />
        </WidgetTitle>
      </WidgetHead>
      {data.length === 0 ? (
        <EmptyState
          icon={ZapIcon}
          title={translateUi('No events yet')}
          variant="inline"
        />
      ) : (
        <div className="flex flex-col gap-1 p-1">
          {data.slice(0, 5).map((item) => (
            <div className="relative px-3 py-2" key={item.name}>
              <div
                className="absolute top-0 bottom-0 left-0 rounded bg-def-200"
                style={{
                  width: `${(item.count / max) * 100}%`,
                }}
              />
              <div className="relative flex justify-between">
                <div>{item.name}</div>
                <div>{item.count}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
};
