import { useMemo, useState } from 'react';
import { Container } from '@/components/Container';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { LazyChart } from '@/components/report/chart/LazyChart';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { createServerSideProps } from '@/server/getServerSideProps';
import type { IChartRange } from '@/types';
import { api } from '@/utils/api';
import { cn } from '@/utils/cn';
import { timeRanges } from '@/utils/constants';
import { getRangeLabel } from '@/utils/getRangeLabel';
import Link from 'next/link';

export const getServerSideProps = createServerSideProps();

export default function Dashboard() {
  const params = useOrganizationParams();

  const query = api.report.list.useQuery({
    projectSlug: params.project,
    dashboardSlug: params.dashboard,
  });

  const dashboard = query.data?.dashboard ?? null;
  const reports = useMemo(() => {
    return query.data?.reports ?? [];
  }, [query]);

  const [range, setRange] = useState<null | IChartRange>(null);

  return (
    <MainLayout>
      <Container>
        <PageTitle>{dashboard?.name}</PageTitle>

        <RadioGroup className="mb-8 overflow-auto">
          {timeRanges.map((item) => {
            return (
              <RadioGroupItem
                key={item.range}
                active={item.range === range}
                onClick={() => {
                  setRange((p) => (p === item.range ? null : item.range));
                }}
              >
                {item.title}
              </RadioGroupItem>
            );
          })}
        </RadioGroup>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {reports.map((report) => {
            const chartRange = getRangeLabel(report.range);
            return (
              <div
                className="rounded-md border border-border bg-white shadow"
                key={report.id}
              >
                <Link
                  href={`/${params.organization}/${params.project}/reports/${report.id}`}
                  className="block border-b border-border p-4 leading-none hover:underline"
                  shallow
                >
                  <div className="font-medium">{report.name}</div>
                  {chartRange !== null && (
                    <div className="mt-2 text-sm flex gap-2">
                      <span className={range !== null ? 'line-through' : ''}>
                        {chartRange}
                      </span>
                      {range !== null && <span>{getRangeLabel(range)}</span>}
                    </div>
                  )}
                </Link>
                <div
                  className={cn(
                    'p-4 pl-2',
                    report.chartType === 'bar' && 'overflow-auto max-h-[300px]'
                  )}
                >
                  <LazyChart
                    {...report}
                    range={range ?? report.range}
                    editMode={false}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    </MainLayout>
  );
}
