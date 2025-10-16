import { Widget } from '@/components/widget';
import { WidgetHead, WidgetTitle } from '../overview/overview-widget';

type Props = {
  data: { count: number; name: string }[];
};

export const MostEvents = ({ data }: Props) => {
  const max = Math.max(...data.map((item) => item.count));
  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle>Popular events</WidgetTitle>
      </WidgetHead>
      <div className="flex flex-col gap-1 p-1">
        {data.slice(0, 5).map((item) => (
          <div key={item.name} className="relative px-3 py-2">
            <div
              className="absolute bottom-0 left-0 top-0 rounded bg-def-200"
              style={{
                width: `${(item.count / max) * 100}%`,
              }}
            />
            <div className="relative flex justify-between ">
              <div>{item.name}</div>
              <div>{item.count}</div>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
};
