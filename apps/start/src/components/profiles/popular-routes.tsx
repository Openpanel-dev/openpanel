import { RouteIcon } from 'lucide-react';
import { Widget, WidgetEmptyState } from '@/components/widget';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';

type Props = {
  data: { count: number; path: string }[];
};

export const PopularRoutes = ({ data }: Props) => {
  const max = data.length > 0 ? Math.max(...data.map((item) => item.count)) : 0;
  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>Most visted pages</WidgetTitle>
      </WidgetHead>
      {data.length === 0 ? (
        <WidgetEmptyState icon={RouteIcon} text="No pages visited yet" />
      ) : (
        // Cap the list height so this widget never forces the right
        // column to grow past the Latest Events column next to it —
        // anything beyond the visible rows scrolls internally.
        <div className="flex max-h-[220px] flex-col gap-1 overflow-y-auto p-1">
          {data.map((item) => (
            <div key={item.path} className="relative px-3 py-2">
              <div
                className="absolute bottom-0 left-0 top-0 rounded bg-def-200"
                style={{
                  width: `${(item.count / max) * 100}%`,
                }}
              />
              <div className="relative flex justify-between ">
                <div>{item.path}</div>
                <div>{item.count}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
};
