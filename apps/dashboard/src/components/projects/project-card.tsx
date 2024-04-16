import { shortNumber } from '@/hooks/useNumerFormatter';
import { escape } from 'sqlstring';

import type { IServiceProject } from '@openpanel/db';
import { chQuery } from '@openpanel/db';

import { ChartSSR } from '../chart-ssr';

export async function ProjectCard({
  id,
  name,
  organizationSlug,
}: IServiceProject) {
  const [chart, [data]] = await Promise.all([
    chQuery<{ value: number; date: string }>(
      `SELECT countDistinct(profile_id) as value, toStartOfDay(created_at) as date FROM events WHERE project_id = ${escape(id)} AND name = 'session_start' AND created_at >= now() - interval '1 month' GROUP BY date ORDER BY date ASC`
    ),
    chQuery<{ total: number; month: number; day: number }>(
      `
        SELECT
        (
          SELECT count(DISTINCT profile_id) as count FROM events WHERE project_id = ${escape(id)}
        ) as total, 
        (
          SELECT count(DISTINCT profile_id) as count FROM events WHERE project_id = ${escape(id)} AND created_at >= now() - interval '1 month'
        ) as month,
        (
          SELECT count(DISTINCT profile_id) as count FROM events WHERE project_id = ${escape(id)} AND created_at >= now() - interval '1 day'
        ) as day
      `
    ),
  ]);

  // For some unknown reason I get when navigating back to this page when using <Link />
  // Should be solved: https://github.com/vercel/next.js/issues/61336
  // But still get the error
  return (
    <a
      href={`/${organizationSlug}/${id}`}
      className="card inline-flex flex-col gap-2 p-4 transition-transform hover:-translate-y-1"
    >
      <div className="font-medium">{name}</div>
      <div className="-mx-4 aspect-[15/1]">
        <ChartSSR data={chart.map((d) => ({ ...d, date: new Date(d.date) }))} />
      </div>
      <div className="flex justify-between gap-4 text-sm text-muted-foreground">
        <div className="font-medium">Visitors</div>
        <div className="flex gap-4">
          <div className="flex flex-col gap-2 md:flex-row">
            <div>Total</div>
            <span className="font-medium text-black">
              {shortNumber('en')(data?.total)}
            </span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <div>Month</div>
            <span className="font-medium text-black">
              {shortNumber('en')(data?.month)}
            </span>
          </div>
          <div className="flex flex-col gap-2 md:flex-row">
            <div>24h</div>
            <span className="font-medium text-black">
              {shortNumber('en')(data?.day)}
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}
