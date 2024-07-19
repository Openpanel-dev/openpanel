import { Suspense } from 'react';
import { shortNumber } from '@/hooks/useNumerFormatter';
import { escape } from 'sqlstring';

import type { IServiceProject } from '@openpanel/db';
import { chQuery, TABLE_NAMES } from '@openpanel/db';

import { ChartSSR } from '../chart-ssr';
import { FadeIn } from '../fade-in';

function ProjectCard({ id, name, organizationSlug }: IServiceProject) {
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
        <Suspense>
          <ProjectChart id={id} />
        </Suspense>
      </div>
      <div className="flex justify-end gap-4 text-sm">
        <Suspense>
          <ProjectMetrics id={id} />
        </Suspense>
      </div>
    </a>
  );
}

async function ProjectChart({ id }: { id: string }) {
  const chart = await chQuery<{ value: number; date: string }>(
    `SELECT countDistinct(profile_id) as value, toStartOfDay(created_at) as date FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(id)} AND name = 'session_start' AND created_at >= now() - interval '1 month' GROUP BY date ORDER BY date ASC`
  );

  return (
    <FadeIn className="h-full w-full">
      <ChartSSR data={chart.map((d) => ({ ...d, date: new Date(d.date) }))} />
    </FadeIn>
  );
}

function Metric({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row">
      <div className="text-muted-foreground">{label}</div>
      <span className="font-medium">{value}</span>
    </div>
  );
}

async function ProjectMetrics({ id }: { id: string }) {
  const [metrics] = await chQuery<{
    total: number;
    month: number;
    day: number;
  }>(
    `
      SELECT
      (
        SELECT count(DISTINCT profile_id) as count FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(id)}
      ) as total, 
      (
        SELECT count(DISTINCT profile_id) as count FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(id)} AND created_at >= now() - interval '1 month'
      ) as month,
      (
        SELECT count(DISTINCT profile_id) as count FROM ${TABLE_NAMES.events} WHERE project_id = ${escape(id)} AND created_at >= now() - interval '1 day'
      ) as day
    `
  );

  return (
    <FadeIn className="flex gap-4">
      <Metric label="Total" value={shortNumber('en')(metrics?.total)} />
      <Metric label="Month" value={shortNumber('en')(metrics?.month)} />
      <Metric label="24h" value={shortNumber('en')(metrics?.day)} />
    </FadeIn>
  );
}

export default ProjectCard;
