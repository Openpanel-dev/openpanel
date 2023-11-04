import resolveConfig from 'tailwindcss/resolveConfig';

import tailwinConfig from '../../tailwind.config';

export const resolvedTailwindConfig = resolveConfig(tailwinConfig);

export const theme = resolvedTailwindConfig.theme;

export function getChartColor(index: number): string {
  const colors = theme?.colors ?? {};
  const chartColors: string[] = Object.keys(colors)
    .filter((key) => key.startsWith('chart-'))
    .map((key) => colors[key])
    .filter((item): item is string => typeof item === 'string');

  return chartColors[index % chartColors.length]!;
}
