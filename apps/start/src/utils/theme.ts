// import resolveConfig from 'tailwindcss/resolveConfig';

import { chartColors } from '@openpanel/constants';

// import tailwinConfig from '../../tailwind.config';

// export const resolvedTailwindConfig = resolveConfig(tailwinConfig);

// export const theme = resolvedTailwindConfig.theme as Record<string, any>;

export function getChartColor(index: number): string {
  return chartColors[index % chartColors.length]?.main || chartColors[0].main;
}

export function getChartTranslucentColor(index: number): string {
  return (
    chartColors[index % chartColors.length]?.translucent ||
    chartColors[0].translucent
  );
}
