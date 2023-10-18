import { api } from "@/utils/api";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ReportLineChartTooltip } from "./ReportLineChartTooltop";
import { useFormatDateInterval } from "@/hooks/useFormatDateInterval";
import {
  type IChartBreakdown,
  type IChartEvent,
  type IInterval,
} from "@/types";
import { getChartColor } from "@/utils/theme";
import { ReportTable } from "./ReportTable";
import { useEffect, useRef, useState } from "react";
import { AutoSizer } from "@/components/AutoSizer";

type ReportLineChartProps = {
  interval: IInterval;
  startDate: Date;
  endDate: Date;
  events: IChartEvent[];
  breakdowns: IChartBreakdown[];
  showTable?: boolean;
};

export function ReportLineChart({
  interval,
  startDate,
  endDate,
  events,
  breakdowns,
  showTable,
}: ReportLineChartProps) {
  const [visibleSeries, setVisibleSeries] = useState<string[]>([]);
  const chart = api.chartMeta.chart.useQuery(
    {
      interval,
      chartType: "linear",
      startDate,
      endDate,
      events,
      breakdowns,
    },
    {
      enabled: events.length > 0,
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
              <LineChart width={width} height={width * 0.5}>
                {/* <Legend /> */}
                <YAxis dataKey={"count"}></YAxis>
                <Tooltip content={<ReportLineChartTooltip />} />
                {/* <Tooltip /> */}
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
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
