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

export function ReportLineChart({
  interval,
  startDate,
  endDate,
  events,
  breakdowns,
}: {
  interval: IInterval;
  startDate: Date;
  endDate: Date;
  events: IChartEvent[];
  breakdowns: IChartBreakdown[];
}) {
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

  return (
    <>
      {chart.isSuccess && chart.data?.series?.[0]?.data && (
        <>
        <LineChart width={800} height={400}>
          <Legend />
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
          {chart.data?.series.slice(0, 5).map((serie, index) => {
            const key = serie.name;
            const strokeColor = getChartColor(index)
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
        <ReportTable data={chart.data} />
        </>
      )}
    </>
  );
}
