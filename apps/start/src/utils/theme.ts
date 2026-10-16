import { chartColors } from '@openpanel/core/modules/report/report.constants';

export function getChartColor(index: number): string {
  return chartColors[index % chartColors.length]?.main || chartColors[0].main;
}

export function getChartTranslucentColor(index: number): string {
  return (
    chartColors[index % chartColors.length]?.translucent ||
    chartColors[0].translucent
  );
}
