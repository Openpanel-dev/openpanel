'use client';

import { Widget, WidgetHead, WidgetTitle } from '@/components/widget';
import { BellIcon, MonitorPlayIcon } from 'lucide-react';

type Props = {
  data: { count: number; path: string }[];
};

const PopularRoutes = ({ data }: Props) => {
  const max = Math.max(...data.map((item) => item.count));
  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={MonitorPlayIcon}>Most visted pages</WidgetTitle>
      </WidgetHead>
      <div className="flex flex-col gap-1 p-1">
        {data.slice(0, 5).map((item) => (
          <div key={item.path} className="relative px-3 py-2">
            <div
              className="absolute bottom-0 left-0 top-0 rounded bg-slate-100"
              style={{
                width: `${(item.count / max) * 100}%`,
              }}
            ></div>
            <div className="relative flex justify-between text-sm">
              <div>{item.path}</div>
              <div>{item.count}</div>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
};

export default PopularRoutes;
