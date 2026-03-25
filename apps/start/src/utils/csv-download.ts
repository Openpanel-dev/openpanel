import type { RouterOutputs } from '@/trpc/client';

type IChartData = RouterOutputs['chart']['chart'];
type FunnelData = RouterOutputs['chart']['funnel'];
type CohortData = RouterOutputs['chart']['cohort'];
type ConversionData = RouterOutputs['chart']['conversion'];

function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCSV(rows: (string | number | null | undefined)[][]): string {
  return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
}

export function downloadCSV(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function chartDataToCSV(data: IChartData): string {
  if (!data.series.length) return '';

  const allDates = [
    ...new Set(data.series.flatMap((s) => s.data.map((d) => d.date))),
  ].sort();

  // Rows = series, columns = dates
  const rows = data.series.map((serie) => {
    const label = serie.names.join(' / ') || serie.event.name;
    const values = allDates.map((date) => {
      const point = serie.data.find((d) => d.date === date);
      return point?.count ?? '';
    });
    return [label, ...values];
  });

  return buildCSV([['Series', ...allDates], ...rows]);
}

export function funnelDataToCSV(data: FunnelData): string {
  if (!data.current.length) return '';

  const hasBreakdowns = data.current.length > 1;

  if (hasBreakdowns) {
    // Columns = steps, rows = breakdown × metric
    const steps = data.current[0]!.steps.map((s) => s.event.displayName);
    const header = ['Breakdown / Metric', ...steps];
    const rows: (string | number | null | undefined)[][] = [];

    for (const variant of data.current) {
      const label = variant.breakdowns.join(' / ') || '(all)';
      rows.push([`${label} (Count)`, ...variant.steps.map((s) => s.count)]);
      rows.push([`${label} (Conversion %)`, ...variant.steps.map((s) => s.percent)]);
      rows.push([`${label} (Dropped After)`, ...variant.steps.map((s) => s.dropoffCount)]);
      rows.push([`${label} (Dropoff %)`, ...variant.steps.map((s) => s.dropoffPercent)]);
    }

    return buildCSV([header, ...rows]);
  }

  // Columns = steps, rows = metrics
  const funnel = data.current[0]!;
  const steps = funnel.steps.map((s) => s.event.displayName);
  const header = ['Metric', ...steps];
  const rows = [
    ['Count', ...funnel.steps.map((s) => s.count)],
    ['Conversion %', ...funnel.steps.map((s) => s.percent)],
    ['Dropped After', ...funnel.steps.map((s) => s.dropoffCount)],
    ['Dropoff %', ...funnel.steps.map((s) => s.dropoffPercent)],
  ];

  return buildCSV([header, ...rows]);
}

export function cohortDataToCSV(data: CohortData): string {
  if (!data.length) return '';

  const cohortDates = data.map((row) => row.cohort_interval);
  const maxPeriods = data[0]?.values.length ?? 0;

  // Rows = periods, columns = cohort dates
  const totalRow: (string | number | null | undefined)[] = [
    'Total Profiles',
    ...data.map((row) => row.sum),
  ];

  const periodRows = Array.from({ length: maxPeriods }, (_, i) => {
    const label = i === 0 ? 'Period <1' : `Period ${i}`;
    return [label, ...data.map((row) => row.values[i] ?? '')];
  });

  return buildCSV([['Cohort Date', ...cohortDates], totalRow, ...periodRows]);
}

export function cohortMembersToCSV(profileIds: string[]): string {
  if (!profileIds.length) return '';
  return buildCSV([['profile_id'], ...profileIds.map((id) => [id])]);
}

export function conversionDataToCSV(data: ConversionData): string {
  if (!data.current.length) return '';

  const allDates = data.current[0]?.data.map((d) => d.date) ?? [];

  // Rows = series × metric, columns = dates
  const rows = data.current.flatMap((serie) => {
    const label = serie.breakdowns.join(' / ') || serie.id;
    const rateRow = [
      `${label} (Rate %)`,
      ...allDates.map((date) => serie.data.find((d) => d.date === date)?.rate ?? ''),
    ];
    const convRow = [
      `${label} (Conversions)`,
      ...allDates.map((date) => serie.data.find((d) => d.date === date)?.conversions ?? ''),
    ];
    const totalRow = [
      `${label} (Total)`,
      ...allDates.map((date) => serie.data.find((d) => d.date === date)?.total ?? ''),
    ];
    return [rateRow, convRow, totalRow];
  });

  return buildCSV([['Series', ...allDates], ...rows]);
}
