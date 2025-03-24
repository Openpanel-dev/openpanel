import { api } from '@/trpc/client';
import { useState } from 'react';

import { Pagination } from '../pagination';
import { Tooltiper } from '../ui/tooltip';
import { WidgetTable } from '../widget-table';

interface Props {
  projectId: string;
}

function getPath(path: string) {
  try {
    return new URL(path).pathname;
  } catch {
    return path;
  }
}

const OverviewTopBots = ({ projectId }: Props) => {
  const [cursor, setCursor] = useState<number>(0);
  const res = api.event.bots.useQuery(
    { projectId, cursor },
    {
      keepPreviousData: true,
    },
  );
  const data = res.data?.data ?? [];
  const count = res.data?.count ?? 0;

  return (
    <>
      <WidgetTable
        className="max-w-full [&_td:first-child]:w-full [&_th]:text-sm [&_tr]:text-sm"
        data={data}
        keyExtractor={(item) => item.id}
        columns={[
          {
            name: 'Path',
            width: 'w-full',
            render(item) {
              return (
                <Tooltiper asChild content={item.path}>
                  <span className="w-full">{getPath(item.path)}</span>
                </Tooltiper>
              );
            },
          },
          {
            name: 'Date',
            width: '100px',
            render(item) {
              return (
                <div className="flex gap-2 whitespace-nowrap">
                  <Tooltiper asChild content={`${item.type}`}>
                    <div>{item.name}</div>
                  </Tooltiper>
                  <Tooltiper
                    asChild
                    content={`${item.createdAt.toLocaleString()}`}
                  >
                    <div>{item.createdAt.toLocaleDateString()}</div>
                  </Tooltiper>
                </div>
              );
            },
          },
        ]}
      />
      <Pagination
        cursor={cursor}
        setCursor={setCursor}
        count={count}
        take={8}
      />
    </>
  );
};

export default OverviewTopBots;
