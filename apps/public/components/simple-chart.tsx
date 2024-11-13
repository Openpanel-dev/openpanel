import { useMemo } from 'react';

interface SimpleChartProps {
  width?: number;
  height?: number;
  points?: number[];
  strokeWidth?: number;
  strokeColor?: string;
  className?: string;
}

export function SimpleChart({
  width = 300,
  height = 100,
  points = [0, 10, 5, 8, 12, 4, 7],
  strokeWidth = 2,
  strokeColor = '#2563eb',
  className,
}: SimpleChartProps) {
  // Skip if no points
  if (!points.length) return null;

  // Calculate scaling factors
  const maxValue = Math.max(...points);
  const xStep = width / (points.length - 1);
  const yScale = height / maxValue;

  // Generate path commands
  const pathCommands = points
    .map((point, index) => {
      const x = index * xStep;
      const y = height - point * yScale;
      return `${index === 0 ? 'M' : 'L'} ${x},${y}`;
    })
    .join(' ');

  // Create area path by adding bottom corners
  const areaPath = `${pathCommands} L ${width},${height} L 0,${height} Z`;

  // Generate unique gradient ID
  const gradientId = `gradient-${strokeColor
    .replace('#', '')
    .replaceAll('(', '')
    .replaceAll(')', '')}`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={`w-full ${className ?? ''}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Area fill */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Stroke line */}
      <path
        d={pathCommands}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />
    </svg>
  );
}
