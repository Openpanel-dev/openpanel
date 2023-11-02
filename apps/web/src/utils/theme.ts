import resolveConfig from 'tailwindcss/resolveConfig';

import tailwinConfig from '../../tailwind.config';

const config = resolveConfig<any>(tailwinConfig);

export const theme = config.theme;

export function getChartColor(index: number): string {
  const chartColors: string[] = Object.keys(theme.colors ?? {})
    .filter((key) => key.startsWith('chart-'))
    .map((key) => theme.colors[key] as string);

  return chartColors[index % chartColors.length]!;
}
