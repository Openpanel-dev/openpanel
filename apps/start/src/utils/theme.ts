// import resolveConfig from 'tailwindcss/resolveConfig';

// import tailwinConfig from '../../tailwind.config';

// export const resolvedTailwindConfig = resolveConfig(tailwinConfig);

// export const theme = resolvedTailwindConfig.theme as Record<string, any>;

const chartColors = [
  '#2563EB',
  '#ff7557',
  '#7fe1d8',
  '#f8bc3c',
  '#b3596e',
  '#72bef4',
  '#ffb27a',
  '#0f7ea0',
  '#3ba974',
  '#febbb2',
  '#cb80dc',
  '#5cb7af',
  '#7856ff',
];

export function getChartColor(index: number): string {
  // const colors = theme?.colors ?? {};
  // const chartColors: string[] = Object.keys(colors)
  //   .filter((key) => key.startsWith('chart-'))
  //   .map((key) => colors[key])
  //   .filter((item): item is string => typeof item === 'string');

  return chartColors[index % chartColors.length]!;
}
