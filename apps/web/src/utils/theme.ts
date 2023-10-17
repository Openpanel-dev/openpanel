import resolveConfig from "tailwindcss/resolveConfig";
import tailwinConfig from "../../tailwind.config.js";
const config = resolveConfig(tailwinConfig);

export const theme = config.theme as any;

export function getChartColor(index: number): string {
  const chartColors: string[] = Object.keys(theme?.colors ?? {})
    .filter((key) => key.startsWith("chart-"))
    .map((key) => theme.colors[key] as string);

  return chartColors[index % chartColors.length]!;
}
