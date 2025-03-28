import { Pagination, usePagination } from '@/components/pagination';
import { Stats, StatsCard } from '@/components/stats';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltiper } from '@/components/ui/tooltip';
import { useFormatDateInterval } from '@/hooks/useFormatDateInterval';
import { useNumber } from '@/hooks/useNumerFormatter';
import { useSelector } from '@/redux';
import { getPropertyLabel } from '@/translations/properties';
import type { IChartData } from '@/trpc/client';
import { getChartColor } from '@/utils/theme';
import type * as React from 'react';

import { logDependencies } from 'mathjs';
import { PreviousDiffIndicator } from './previous-diff-indicator';
import { SerieName } from './serie-name';

interface ReportTableProps {
  data: IChartData;
  visibleSeries: IChartData['series'];
  setVisibleSeries: React.Dispatch<React.SetStateAction<string[]>>;
}

const ROWS_LIMIT = 50;

export function ReportTable({
  data,
  visibleSeries,
  setVisibleSeries,
}: ReportTableProps) {
  const { setPage, paginate, page } = usePagination(ROWS_LIMIT);
  const number = useNumber();
  const interval = useSelector((state) => state.report.interval);
  const breakdowns = useSelector((state) => state.report.breakdowns);
  const formatDate = useFormatDateInterval(interval);

  function handleChange(name: string, checked: boolean) {
    setVisibleSeries((prev) => {
      if (checked) {
        return [...prev, name];
      }
      return prev.filter((item) => item !== name);
    });
  }

  return (
    <>
      <Stats className="my-4 grid grid-cols-1 @xl:grid-cols-3 @4xl:grid-cols-6">
        <StatsCard title="Total" value={number.format(data.metrics.sum)} />
        <StatsCard
          title="Average"
          value={number.format(data.metrics.average)}
        />
        <StatsCard title="Min" value={number.format(data.metrics.min)} />
        <StatsCard title="Max" value={number.format(data.metrics.max)} />
      </Stats>
      <div className="grid grid-cols-[max(300px,30vw)_1fr] overflow-hidden rounded-md border border-border">
        <Table className="rounded-none border-b-0 border-l-0 border-t-0">
          <TableHeader>
            <TableRow>
              {breakdowns.length === 0 && <TableHead>Name</TableHead>}
              {breakdowns.map((breakdown) => (
                <TableHead key={breakdown.name}>
                  {getPropertyLabel(breakdown.name)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-def-100">
            {paginate(data.series).map((serie, index) => {
              const checked = !!visibleSeries.find(
                (item) => item.id === serie.id,
              );

              return (
                <TableRow key={`${serie.id}-1`}>
                  {serie.names.map((name, nameIndex) => {
                    return (
                      <TableCell className="h-10" key={name}>
                        <div className="flex items-center gap-2">
                          {nameIndex === 0 ? (
                            <>
                              <Checkbox
                                onCheckedChange={(checked) =>
                                  handleChange(serie.id, !!checked)
                                }
                                style={
                                  checked
                                    ? {
                                        background: getChartColor(index),
                                        borderColor: getChartColor(index),
                                      }
                                    : undefined
                                }
                                checked={checked}
                              />
                              <Tooltiper
                                side="left"
                                sideOffset={30}
                                content={<SerieName name={serie.names} />}
                              >
                                {name}
                              </Tooltiper>
                            </>
                          ) : (
                            <SerieName name={name} />
                          )}
                        </div>
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <div className="overflow-auto">
          <Table className="rounded-none border-none">
            <TableHeader>
              <TableRow>
                <TableHead>Total</TableHead>
                <TableHead>Average</TableHead>
                {data.series[0]?.data.map((serie) => (
                  <TableHead
                    key={serie.date.toString()}
                    className="whitespace-nowrap"
                  >
                    {formatDate(serie.date)}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginate(data.series).map((serie) => {
                return (
                  <TableRow key={`${serie.id}-2`}>
                    <TableCell className="h-10">
                      <div className="flex items-center gap-2 font-medium">
                        {number.format(serie.metrics.sum)}
                        <PreviousDiffIndicator
                          {...serie.metrics.previous?.sum}
                        />
                      </div>
                    </TableCell>
                    <TableCell className="h-10">
                      <div className="flex items-center gap-2 font-medium">
                        {number.format(serie.metrics.average)}
                        <PreviousDiffIndicator
                          {...serie.metrics.previous?.average}
                        />
                      </div>
                    </TableCell>

                    {serie.data.map((item) => {
                      return (
                        <TableCell className="h-10" key={item.date.toString()}>
                          <div className="flex items-center gap-2">
                            {number.format(item.count)}
                            <PreviousDiffIndicator {...item.previous} />
                          </div>
                        </TableCell>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="row mt-4 justify-end">
        <Pagination
          cursor={page}
          setCursor={setPage}
          take={ROWS_LIMIT}
          count={data.series.length}
        />
      </div>
    </>
  );
}
