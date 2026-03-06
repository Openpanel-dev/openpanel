import { PageContainer } from '@/components/page-container';
import { PageHeader } from '@/components/page-header';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAppParams } from '@/hooks/use-app-params';
import { useTRPC } from '@/integrations/trpc/react';
import { createProjectTitle } from '@/utils/title';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { subDays, format } from 'date-fns';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export const Route = createFileRoute(
  '/_app/$organizationId/$projectId/seo'
)({
  component: SeoPage,
  head: () => ({
    meta: [{ title: createProjectTitle('SEO') }],
  }),
});

const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
const endDate = format(subDays(new Date(), 1), 'yyyy-MM-dd');

function SeoPage() {
  const { projectId, organizationId } = useAppParams();
  const trpc = useTRPC();
  const navigate = useNavigate();

  const connectionQuery = useQuery(
    trpc.gsc.getConnection.queryOptions({ projectId })
  );

  const connection = connectionQuery.data;
  const isConnected = connection && connection.siteUrl;

  const overviewQuery = useQuery(
    trpc.gsc.getOverview.queryOptions(
      { projectId, startDate, endDate },
      { enabled: !!isConnected }
    )
  );

  const pagesQuery = useQuery(
    trpc.gsc.getPages.queryOptions(
      { projectId, startDate, endDate, limit: 50 },
      { enabled: !!isConnected }
    )
  );

  const queriesQuery = useQuery(
    trpc.gsc.getQueries.queryOptions(
      { projectId, startDate, endDate, limit: 50 },
      { enabled: !!isConnected }
    )
  );

  if (connectionQuery.isLoading) {
    return (
      <PageContainer>
        <PageHeader title="SEO" description="Google Search Console data" />
        <div className="space-y-4 mt-8">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </PageContainer>
    );
  }

  if (!isConnected) {
    return (
      <PageContainer>
        <PageHeader title="SEO" description="Connect Google Search Console to see your search performance data." />
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <div className="rounded-full bg-muted p-6">
            <svg
              className="h-12 w-12 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold">No SEO data yet</h2>
          <p className="text-muted-foreground max-w-sm">
            Connect Google Search Console to track your search impressions, clicks, and keyword rankings.
          </p>
          <Button
            onClick={() =>
              navigate({
                to: '/$organizationId/$projectId/settings/gsc',
                params: { organizationId, projectId },
              })
            }
          >
            Connect Google Search Console
          </Button>
        </div>
      </PageContainer>
    );
  }

  const overview = overviewQuery.data ?? [];
  const pages = pagesQuery.data ?? [];
  const queries = queriesQuery.data ?? [];

  return (
    <PageContainer>
      <PageHeader
        title="SEO"
        description={`Search performance for ${connection.siteUrl}`}
      />

      <div className="mt-8 space-y-8">
        {/* Summary metrics */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {(['clicks', 'impressions', 'ctr', 'position'] as const).map((metric) => {
            const total = overview.reduce((sum, row) => {
              if (metric === 'ctr' || metric === 'position') {
                return sum + row[metric];
              }
              return sum + row[metric];
            }, 0);
            const display =
              metric === 'ctr'
                ? `${((total / Math.max(overview.length, 1)) * 100).toFixed(1)}%`
                : metric === 'position'
                  ? (total / Math.max(overview.length, 1)).toFixed(1)
                  : total.toLocaleString();
            const label =
              metric === 'ctr'
                ? 'Avg CTR'
                : metric === 'position'
                  ? 'Avg Position'
                  : metric.charAt(0).toUpperCase() + metric.slice(1);

            return (
              <div key={metric} className="rounded-lg border p-4">
                <div className="text-sm text-muted-foreground">{label}</div>
                <div className="text-2xl font-semibold mt-1">{overviewQuery.isLoading ? <Skeleton className="h-8 w-24" /> : display}</div>
              </div>
            );
          })}
        </div>

        {/* Clicks over time chart */}
        <div className="rounded-lg border p-4">
          <h3 className="font-medium mb-4">Clicks over time</h3>
          {overviewQuery.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={overview}>
                <defs>
                  <linearGradient id="colorClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="clicks"
                  stroke="hsl(var(--primary))"
                  fill="url(#colorClicks)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Pages and Queries tables */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
          <GscTable
            title="Top pages"
            rows={pages}
            keyLabel="Page"
            keyField="page"
            isLoading={pagesQuery.isLoading}
          />
          <GscTable
            title="Top queries"
            rows={queries}
            keyLabel="Query"
            keyField="query"
            isLoading={queriesQuery.isLoading}
          />
        </div>
      </div>
    </PageContainer>
  );
}

interface GscTableRow {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  [key: string]: string | number;
}

function GscTable({
  title,
  rows,
  keyLabel,
  keyField,
  isLoading,
}: {
  title: string;
  rows: GscTableRow[];
  keyLabel: string;
  keyField: string;
  isLoading: boolean;
}) {
  return (
    <div className="rounded-lg border">
      <div className="p-4 border-b">
        <h3 className="font-medium">{title}</h3>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{keyLabel}</TableHead>
            <TableHead className="text-right">Clicks</TableHead>
            <TableHead className="text-right">Impressions</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">Position</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading &&
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 5 }).map((_, j) => (
                  <TableCell key={j}>
                    <Skeleton className="h-4 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {!isLoading && rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No data yet
              </TableCell>
            </TableRow>
          )}
          {rows.map((row) => (
            <TableRow key={String(row[keyField])}>
              <TableCell className="max-w-[200px] truncate font-mono text-xs">
                {String(row[keyField])}
              </TableCell>
              <TableCell className="text-right">{row.clicks.toLocaleString()}</TableCell>
              <TableCell className="text-right">{row.impressions.toLocaleString()}</TableCell>
              <TableCell className="text-right">{(row.ctr * 100).toFixed(1)}%</TableCell>
              <TableCell className="text-right">{row.position.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
