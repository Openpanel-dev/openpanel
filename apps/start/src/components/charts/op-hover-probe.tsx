import { useEffect } from 'react';
import { useChart } from './chart-context';

interface OPHoverProbeProps {
  /** Called whenever the hovered data-point index changes. */
  onChange: (index: number | null) => void;
}

/**
 * Tiny no-render child that exposes a bklit chart's hovered index via callback.
 * Drop inside any bklit time-series / bar chart to wire it up to external state.
 */
export function OPHoverProbe({ onChange }: OPHoverProbeProps) {
  const { tooltipData } = useChart();
  const index = tooltipData?.index ?? null;
  useEffect(() => {
    onChange(index);
  }, [index, onChange]);
  return null;
}
