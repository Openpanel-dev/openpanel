// import resolveConfig from 'tailwindcss/resolveConfig';

// import tailwinConfig from '../../tailwind.config';

// export const resolvedTailwindConfig = resolveConfig(tailwinConfig);

// export const theme = resolvedTailwindConfig.theme as Record<string, any>;

const chartColors = [
  { main: '#2563EB', translucent: 'rgba(37, 99, 235, 0.1)' },
  { main: '#ff7557', translucent: 'rgba(255, 117, 87, 0.1)' },
  { main: '#7fe1d8', translucent: 'rgba(127, 225, 216, 0.1)' },
  { main: '#f8bc3c', translucent: 'rgba(248, 188, 60, 0.1)' },
  { main: '#b3596e', translucent: 'rgba(179, 89, 110, 0.1)' },
  { main: '#72bef4', translucent: 'rgba(114, 190, 244, 0.1)' },
  { main: '#ffb27a', translucent: 'rgba(255, 178, 122, 0.1)' },
  { main: '#0f7ea0', translucent: 'rgba(15, 126, 160, 0.1)' },
  { main: '#3ba974', translucent: 'rgba(59, 169, 116, 0.1)' },
  { main: '#febbb2', translucent: 'rgba(254, 187, 178, 0.1)' },
  { main: '#cb80dc', translucent: 'rgba(203, 128, 220, 0.1)' },
  { main: '#5cb7af', translucent: 'rgba(92, 183, 175, 0.1)' },
  { main: '#7856ff', translucent: 'rgba(120, 86, 255, 0.1)' },
];

export function getChartColor(index: number): string {
  return chartColors[index % chartColors.length]?.main || chartColors[0].main;
}

export function getChartTranslucentColor(index: number): string {
  return (
    chartColors[index % chartColors.length]?.translucent ||
    chartColors[0].translucent
  );
}
