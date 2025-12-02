'use client';

import { FeatureCardContainer } from '@/components/feature-card';
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
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg min-w-[200px]">
        <div className="text-sm font-semibold mb-2">{label}</div>
        <div className="text-sm text-muted-foreground space-y-1 flex-1">
          <div className="row gap-2 items-center flex-1">
            <div className="h-6 bg-foreground w-1 rounded-full" />
            <div className="font-medium row items-center gap-2 justify-between flex-1">
              <span>Visitors</span> <span>{visitors.toLocaleString()}</span>
            </div>
          </div>
          <div className="row gap-2 items-center flex-1">
            <div className="h-6 bg-emerald-500 w-1 rounded-full" />
            <div className="font-medium row items-center gap-2 justify-between flex-1">
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
    <FeatureCardContainer className="col gap-4 h-full">
      {/* Header */}
      <div className="row items-center justify-between">
        <div>
          <h3 className="font-semibold">Product page views</h3>
          <p className="text-sm text-muted-foreground">Last 7 days</p>
        </div>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <MoreVerticalIcon className="size-4" />
        </button>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            onMouseMove={(state) => {
              if (state?.activeTooltipIndex !== undefined) {
                setActiveIndex(state.activeTooltipIndex);
              }
            }}
            onMouseLeave={() => setActiveIndex(null)}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              opacity={0.3}
            />
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
            />
            <YAxis
              yAxisId="left"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              hide
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }}
              domain={[0, 2400]}
              hide
            />
            <Tooltip content={<CustomTooltip />} cursor={false} />
            {/* Revenue bars */}
            <Bar yAxisId="right" dataKey="revenue" radius={4}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${entry.day}`}
                  className={
                    activeIndex === index
                      ? 'fill-emerald-500' // Lighter green on hover
                      : 'fill-foreground/30' // Default green
                  }
                  style={{ transition: 'fill 0.2s ease' }}
                />
              ))}
            </Bar>
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="visitors"
              strokeWidth={2}
              stroke="var(--foreground)"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-4 center-center">
        <div>
          <div className="text-2xl font-semibold font-mono">
            {totalVisitors.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Visitors</div>
        </div>
        <div>
          <div className="text-2xl font-semibold font-mono text-emerald-500">
            ${totalRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Revenue</div>
        </div>
      </div>
    </FeatureCardContainer>
  );
}
