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

  const headers = [
    'Date',
    ...data.series.map((s) => s.names.join(' / ') || s.event.name),
  ];

  const allDates = [
    ...new Set(data.series.flatMap((s) => s.data.map((d) => d.date))),
  ].sort();

  const rows = allDates.map((date) => {
    const values = data.series.map((serie) => {
      const point = serie.data.find((d) => d.date === date);
      return point?.count ?? '';
    });
    return [date, ...values];
  });

  return buildCSV([headers, ...rows]);
}

export function funnelDataToCSV(data: FunnelData): string {
  if (!data.current.length) return '';

  const hasBreakdowns = data.current.length > 1;

  if (hasBreakdowns) {
    const headers = [
      'Breakdown',
      'Step',
      'Count',
      'Conversion %',
      'Dropped After',
      'Dropoff %',
    ];
    const rows: (string | number | null | undefined)[][] = [];

    for (const variant of data.current) {
      const breakdownLabel = variant.breakdowns.join(' / ') || '(all)';
      for (const step of variant.steps) {
        rows.push([
          breakdownLabel,
          step.event.displayName,
          step.count,
          step.percent,
          step.dropoffCount,
          step.dropoffPercent,
        ]);
      }
    }

    return buildCSV([headers, ...rows]);
  }

  const funnel = data.current[0]!;
  const headers = [
    'Step',
    'Count',
    'Conversion %',
    'Dropped After',
    'Dropoff %',
  ];
  const rows = funnel.steps.map((step) => [
    step.event.displayName,
    step.count,
    step.percent,
    step.dropoffCount,
    step.dropoffPercent,
  ]);

  return buildCSV([headers, ...rows]);
}

export function cohortDataToCSV(data: CohortData): string {
  if (!data.length) return '';

  const maxPeriods = data[0]?.values.length ?? 0;
  const periodHeaders = Array.from({ length: maxPeriods }, (_, i) =>
    i === 0 ? 'Period <1' : `Period ${i}`,
  );

  const headers = ['Cohort Date', 'Total Profiles', ...periodHeaders];
  const rows = data.map((row) => [row.cohort_interval, row.sum, ...row.values]);

  return buildCSV([headers, ...rows]);
}

export function conversionDataToCSV(data: ConversionData): string {
  if (!data.current.length) return '';

  const headers = [
    'Date',
    ...data.current.flatMap((serie) => {
      const label = serie.breakdowns.join(' / ') || serie.id;
      return [
        `${label} (Rate %)`,
        `${label} (Conversions)`,
        `${label} (Total)`,
      ];
    }),
  ];

  const allDates = data.current[0]?.data.map((d) => d.date) ?? [];

  const rows = allDates.map((date) => {
    const values = data.current.flatMap((serie) => {
      const point = serie.data.find((d) => d.date === date);
      return [point?.rate ?? '', point?.conversions ?? '', point?.total ?? ''];
    });
    return [date, ...values];
  });

  return buildCSV([headers, ...rows]);
}
