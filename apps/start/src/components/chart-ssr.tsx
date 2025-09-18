import * as d3 from 'd3';

export function ChartSSR({
  data,
  dots = false,
  color = 'blue',
}: {
  dots?: boolean;
  color?: 'blue' | 'green' | 'red';
  data: { value: number; date: Date }[];
}) {
  if (data.length === 0) {
    return null;
  }

  const xScale = d3
    .scaleTime()
    .domain([data[0]!.date, data[data.length - 1]!.date])
    .range([0, 100]);
  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(data.map((d) => d.value)) ?? 0])
    .range([100, 0]);

  const line = d3
    .line<(typeof data)[number]>()
    .curve(d3.curveMonotoneX)
    .x((d) => xScale(d.date))
    .y((d) => yScale(d.value));

  const area = d3
    .area<(typeof data)[number]>()
    .curve(d3.curveMonotoneX)
    .x((d) => xScale(d.date))
    .y0(yScale(0))
    .y1((d) => yScale(d.value));

  const pathLine = line(data);
  const pathArea = area(data);

  if (!pathLine) {
    return null;
  }

  const gradientId = `gradient-${color}`;

  return (
    <div className="relative h-full w-full">
      {/* Chart area */}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <svg
          viewBox="0 0 100 100"
          className="overflow-visible"
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="100%"
              gradientUnits="userSpaceOnUse"
            >
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="50%" stopColor={color} stopOpacity={0.05} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {/* Gradient area */}
          {pathArea && (
            <path
              d={pathArea}
              fill={`url(#${gradientId})`}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {/* Line */}
          <path
            d={pathLine}
            fill="none"
            className={
              color === 'green'
                ? 'text-green-600'
                : color === 'red'
                  ? 'text-red-600'
                  : 'text-highlight'
            }
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Circles */}
          {dots &&
            data.map((d) => (
              <path
                key={d.date.toString()}
                d={`M ${xScale(d.date)} ${yScale(d.value)} l 0.0001 0`}
                vectorEffect="non-scaling-stroke"
                strokeWidth="8"
                strokeLinecap="round"
                fill="none"
                stroke="currentColor"
                className="text-gray-400"
              />
            ))}
        </svg>
      </svg>
    </div>
  );
}
