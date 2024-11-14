'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

// Mock data structure for retention cohort
const COHORT_DATA = [
  {
    week: 'Week 1',
    users: '2,543',
    retention: [100, 84, 73, 67, 62, 58],
  },
  {
    week: 'Week 2',
    users: '2,148',
    retention: [100, 80, 69, 63, 59, 55],
  },
  {
    week: 'Week 3',
    users: '1,958',
    retention: [100, 82, 71, 64, 60, 56],
  },
  {
    week: 'Week 4',
    users: '2,034',
    retention: [100, 83, 72, 65, 61, 57],
  },
  {
    week: 'Week 5',
    users: '1,987',
    retention: [100, 81, 70, 64, 60, 56],
  },
  {
    week: 'Week 6',
    users: '2,245',
    retention: [100, 85, 74, 68, 64, 60],
  },
  {
    week: 'Week 7',
    users: '2,108',
    retention: [100, 82, 71, 65, 61],
  },
  {
    week: 'Week 8',
    users: '1,896',
    retention: [100, 83, 72, 66],
  },
  {
    week: 'Week 9',
    users: '2,156',
    retention: [100, 81, 70],
  },
];
const COHORT_DATA_ALT = [
  {
    week: 'Week 1',
    users: '2,876',
    retention: [100, 79, 76, 70, 65, 61],
  },
  {
    week: 'Week 2',
    users: '2,543',
    retention: [100, 85, 73, 67, 62, 58],
  },
  {
    week: 'Week 3',
    users: '2,234',
    retention: [100, 79, 75, 68, 63, 59],
  },
  {
    week: 'Week 4',
    users: '2,456',
    retention: [100, 88, 77, 69, 65, 61],
  },
  {
    week: 'Week 5',
    users: '2,321',
    retention: [100, 77, 73, 67, 54, 42],
  },
  {
    week: 'Week 6',
    users: '2,654',
    retention: [100, 91, 83, 69, 66, 62],
  },
  {
    week: 'Week 7',
    users: '2,432',
    retention: [100, 93, 88, 72, 64],
  },
  {
    week: 'Week 8',
    users: '2,123',
    retention: [100, 78, 76, 69],
  },
  {
    week: 'Week 9',
    users: '2,567',
    retention: [100, 70, 64],
  },
];

function RetentionCell({ percentage }: { percentage: number }) {
  // Calculate color intensity based on percentage
  const getBackgroundColor = (value: number) => {
    if (value === 0) return 'bg-transparent';
    // Using CSS color mixing to create a gradient from light to dark blue
    return `rgb(${Math.round(239 - value * 1.39)} ${Math.round(246 - value * 1.46)} ${Math.round(255 - value * 0.55)})`;
  };

  return (
    <div className="flex items-center justify-center p-px text-sm font-medium w-[80px]">
      <div
        className="flex text-white items-center justify-center w-full h-full rounded"
        style={{
          backgroundColor: getBackgroundColor(percentage),
        }}
      >
        <motion.span
          key={percentage}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {percentage}%
        </motion.span>
      </div>
    </div>
  );
}

export function ProductAnalyticsFeature() {
  const [currentData, setCurrentData] = useState(COHORT_DATA);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentData((current) =>
        current === COHORT_DATA ? COHORT_DATA_ALT : COHORT_DATA,
      );
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 w-full overflow-hidden">
      <div className="flex">
        {/* Header row */}
        <div className="min-w-[70px] flex flex-col">
          <div className="p-2 font-medium text-xs text-muted-foreground">
            Cohort
          </div>
        </div>

        {/* Week numbers - changed length to 6 */}
        <div className="flex">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i.toString()}
              className="text-muted-foreground w-[80px] text-xs text-center p-2 font-medium"
            >
              W{i + 1}
            </div>
          ))}
        </div>
      </div>

      {/* Data rows */}
      <div className="flex flex-col">
        {currentData.map((cohort, rowIndex) => (
          <div key={rowIndex.toString()} className="flex">
            <div className="min-w-[70px] flex flex-col">
              <div className="p-2 text-sm whitespace-nowrap text-muted-foreground">
                {cohort.week}
              </div>
            </div>
            <div className="flex">
              {cohort.retention.map((value, cellIndex) => (
                <RetentionCell key={cellIndex.toString()} percentage={value} />
              ))}
              {/* Fill empty cells - changed length to 6 */}
              {Array.from({ length: 6 - cohort.retention.length }).map(
                (_, i) => (
                  <div key={`empty-${i.toString()}`} className="w-[80px] p-px">
                    <div className="h-full w-full rounded bg-background" />
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
