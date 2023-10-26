import { api } from "@/utils/api";
import {
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReportLineChartTooltip } from "./ReportLineChartTooltop";
import { useFormatDateInterval } from "@/hooks/useFormatDateInterval";
import { type IChartInput } from "@/types";
import { getChartColor } from "@/utils/theme";
import { ReportTable } from "./ReportTable";
import { useEffect, useRef, useState } from "react";
import { AutoSizer } from "@/components/AutoSizer";

type ReportLineChartProps = IChartInput & {
  showTable?: boolean;
};

export function ReportLineChart({
  interval,
  startDate,
  endDate,
  events,
  breakdowns,
  showTable,
  chartType,
  name,
}: ReportLineChartProps) {
  const [visibleSeries, setVisibleSeries] = useState<string[]>([]);

  const hasEmptyFilters = events.some((event) => event.filters.some((filter) => filter.value.length === 0));

  const chart = api.chart.chart.useQuery(
    {
      interval,
      chartType,
      startDate,
      endDate,
      events,
      breakdowns,
      name,
    },
    {
      enabled: events.length > 0 && !hasEmptyFilters,
    },
  );

  const formatDate = useFormatDateInterval(interval);

  const ref = useRef(false);
  useEffect(() => {
    if (!ref.current && chart.data) {
      const max = 20;

      setVisibleSeries(
        chart.data?.series?.slice(0, max).map((serie) => serie.name) ?? [],
      );
      // ref.current = true;
    }
  }, [chart.data]);

  return (
    <>
      {chart.isSuccess && chart.data?.series?.[0]?.data && (
        <>
          <AutoSizer disableHeight>
            {({ width }) => (
              <LineChart width={width} height={Math.min(width * 0.5, 400)}>
                <YAxis dataKey={"count"} width={30} fontSize={12}></YAxis>
                <Tooltip content={<ReportLineChartTooltip />} />
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                 fontSize={12}
                  dataKey="date"
                  tickFormatter={(m: Date) => {
                    return formatDate(m);
                  }}
                  tickLine={false}
                  allowDuplicatedCategory={false}
                />
                {chart.data?.series
                  .filter((serie) => {
                    return visibleSeries.includes(serie.name);
                  })
                  .map((serie) => {
                    const realIndex = chart.data?.series.findIndex(
                      (item) => item.name === serie.name,
                    );
                    const key = serie.name;
                    const strokeColor = getChartColor(realIndex);
                    return (
                      <Line
                        type="monotone"
                        key={key}
                        isAnimationActive={false}
                        strokeWidth={2}
                        dataKey="count"
                        stroke={strokeColor}
                        data={serie.data}
                        name={serie.name}
                      />
                    );
                  })}
              </LineChart>
            )}
          </AutoSizer>
          {showTable && (
            <ReportTable
              data={chart.data}
              visibleSeries={visibleSeries}
              setVisibleSeries={setVisibleSeries}
            />
          )}
        </>
      )}
    </>
  );
}
