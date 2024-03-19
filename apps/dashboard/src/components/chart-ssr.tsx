import * as d3 from 'd3';

export function ChartSSR({
  data,
  dots = false,
}: {
  dots?: boolean;
  data: { value: number; date: Date }[];
}) {
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

  const d = line(data);

  if (!d) {
    return null;
  }

  return (
    <div className="@container relative h-full w-full">
      {/* Chart area */}
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <svg
          viewBox="0 0 100 100"
          className="overflow-visible"
          preserveAspectRatio="none"
        >
          {/* Line */}
          <path
            d={d}
            fill="none"
            className="text-blue-600"
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
