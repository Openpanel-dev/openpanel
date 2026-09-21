'use client';

import { MoreVerticalIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { FeatureCardContainer } from '@/components/feature-card';

// Sample data for the last 7 days
const data = [
  { day: 'Mon', visitors: 1200, revenue: 1250 },
  { day: 'Tue', visitors: 1450, revenue: 1890 },
  { day: 'Wed', visitors: 1320, revenue: 1520 },
  { day: 'Thu', visitors: 1580, revenue: 2100 },
  { day: 'Fri', visitors: 1420, revenue: 1750 },
  { day: 'Sat', visitors: 1180, revenue: 1100 },
  { day: 'Sun', visitors: 1250, revenue: 1380 },
];

// Custom tooltip component
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const visitors =
      payload.find((p: any) => p.dataKey === 'visitors')?.value || 0;
    const revenue =
      payload.find((p: any) => p.dataKey === 'revenue')?.value || 0;

    return (
      <div className="min-w-[200px] rounded-lg border border-border bg-card p-3 shadow-lg">
        <div className="mb-2 font-semibold text-sm">{label}</div>
        <div className="flex-1 space-y-1 text-muted-foreground text-sm">
          <div className="row flex-1 items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-foreground" />
            <div className="row flex-1 items-center justify-between gap-2 font-medium">
              <span>Visitors</span> <span>{visitors.toLocaleString()}</span>
            </div>
          </div>
          <div className="row flex-1 items-center gap-2">
            <div className="h-6 w-1 rounded-full bg-emerald-500" />
            <div className="row flex-1 items-center justify-between gap-2 font-medium">
              <span>Revenue</span> <span>${revenue.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return null;
};

export function CollaborationChart() {
  const [activeIndex, setActiveIndex] = useState<number | null>(1); // Default to Tue (index 1)

  // Calculate metrics from active point or default
  const activeData = useMemo(() => {
    return activeIndex !== null ? data[activeIndex] : data[1];
  }, [activeIndex]);

  const totalVisitors = activeData.visitors;
  const totalRevenue = activeData.revenue;

  return (
    <FeatureCardContainer className="col h-full gap-4">
      {/* Header */}
      <div className="row items-center justify-between">
        <div>
          <h3 className="font-semibold">Product page views</h3>
          <p className="text-muted-foreground text-sm">Last 7 days</p>
        </div>
        <button
          className="text-muted-foreground transition-colors hover:text-foreground"
          type="button"
        >
          <MoreVerticalIcon className="size-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="min-h-[200px] flex-1">
        <ResponsiveContainer height="100%" width="100%">
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            onMouseLeave={() => setActiveIndex(null)}
            onMouseMove={(state) => {
              if (state?.activeTooltipIndex !== undefined) {
                setActiveIndex(state.activeTooltipIndex);
              }
            }}
          >
            <CartesianGrid
              opacity={0.3}
              stroke="hsl(var(--border))"
              strokeDasharray="3 3"
            />
            <XAxis
              axisLine={false}
              dataKey="day"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
            />
            <YAxis
              axisLine={false}
              hide
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              yAxisId="left"
            />
            <YAxis
              axisLine={false}
              domain={[0, 2400]}
              hide
              orientation="right"
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              tickLine={false}
              yAxisId="right"
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            {/* Revenue bars */}
            <Bar dataKey="revenue" radius={4} yAxisId="right">
              {data.map((entry, index) => (
                <Cell
                  className={
                    activeIndex === index
                      ? 'fill-emerald-500' // Lighter green on hover
                      : 'fill-foreground/30' // Default green
                  }
                  key={`cell-${entry.day}`}
                  style={{ transition: 'fill 0.2s ease' }}
                />
              ))}
            </Bar>
            <Line
              dataKey="visitors"
              dot={false}
              stroke="var(--foreground)"
              strokeWidth={2}
              type="monotone"
              yAxisId="left"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics */}
      <div className="center-center grid grid-cols-2 gap-4">
        <div>
          <div className="font-mono font-semibold text-2xl">
            {totalVisitors.toLocaleString()}
          </div>
          <div className="text-muted-foreground text-xs">Visitors</div>
        </div>
        <div>
          <div className="font-mono font-semibold text-2xl text-emerald-500">
            ${totalRevenue.toLocaleString()}
          </div>
          <div className="text-muted-foreground text-xs">Revenue</div>
        </div>
      </div>
    </FeatureCardContainer>
  );
}
