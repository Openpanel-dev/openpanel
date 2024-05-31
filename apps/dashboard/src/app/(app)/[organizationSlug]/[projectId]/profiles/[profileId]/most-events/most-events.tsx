'use client';

import { Widget, WidgetHead, WidgetTitle } from '@/components/widget';
import { BellIcon } from 'lucide-react';

type Props = {
  data: { count: number; name: string }[];
};

const MostEvents = ({ data }: Props) => {
  const max = Math.max(...data.map((item) => item.count));
  return (
    <Widget className="w-full">
      <WidgetHead>
        <WidgetTitle icon={BellIcon}>Popular events</WidgetTitle>
      </WidgetHead>
      <div className="flex flex-col gap-1 p-1">
        {data.slice(0, 5).map((item) => (
          <div key={item.name} className="relative px-3 py-2">
            <div
              className="bg-def-200 absolute bottom-0 left-0 top-0 rounded"
              style={{
                width: `${(item.count / max) * 100}%`,
              }}
            ></div>
            <div className="relative flex justify-between text-sm">
              <div>{item.name}</div>
              <div>{item.count}</div>
            </div>
          </div>
        ))}
      </div>
    </Widget>
  );
};

export default MostEvents;
