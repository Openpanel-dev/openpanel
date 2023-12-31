import { useMemo, useState } from 'react';
import { CardActions, CardActionsItem } from '@/components/Card';
import { Container } from '@/components/Container';
import { MainLayout } from '@/components/layouts/MainLayout';
import { PageTitle } from '@/components/PageTitle';
import { LazyChart } from '@/components/report/chart/LazyChart';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { db } from '@/server/db';
import { createServerSideProps } from '@/server/getServerSideProps';
import { getDashboardBySlug } from '@/server/services/dashboard.service';
import type { IChartRange } from '@/types';
import { api, handleError } from '@/utils/api';
import { cn } from '@/utils/cn';
import { timeRanges } from '@/utils/constants';
import { getRangeLabel } from '@/utils/getRangeLabel';
import { ChevronRight, MoreHorizontal, Trash } from 'lucide-react';
import Link from 'next/link';

export const getServerSideProps = createServerSideProps(async (context) => {
  const projectSlug = context.params?.project as string;
  const dashboardSlug = context.params?.dashboard as string;
  try {
    await db.dashboard.findFirstOrThrow({
      select: {
        id: true,
      },
      where: {
        slug: dashboardSlug,
        project: {
          slug: projectSlug,
        },
      },
    });
  } catch (error) {
    return {
      notFound: true,
    };
  }
});

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

  const deletion = api.report.delete.useMutation({
    onError: handleError,
    onSuccess() {
      query.refetch();
    },
  });

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
                  href={`/${params.organization}/${params.project}/reports/${report.id}?dashboard=${params.dashboard}`}
                  className="flex border-b border-border p-4 leading-none [&_svg]:hover:opacity-100 items-center justify-between"
                  shallow
                >
                  <div>
                    <div className="font-medium">{report.name}</div>
                    {chartRange !== null && (
                      <div className="mt-2 text-sm flex gap-2">
                        <span className={range !== null ? 'line-through' : ''}>
                          {chartRange}
                        </span>
                        {range !== null && <span>{getRangeLabel(range)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger className="h-8 w-8 hover:border rounded justify-center items-center flex">
                        <MoreHorizontal size={16} />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[200px]">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(event) => {
                              event.stopPropagation();
                              deletion.mutate({
                                reportId: report.id,
                              });
                            }}
                          >
                            <Trash size={16} className="mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <ChevronRight
                      className="opacity-10 transition-opacity"
                      size={16}
                    />
                  </div>
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
