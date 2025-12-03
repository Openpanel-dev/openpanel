'use client';
import { SimpleChart } from '@/components/simple-chart';
import { cn } from '@/lib/utils';
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUpIcon } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';

const TRAFFIC_SOURCES = [
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Fgoogle.com',
    name: 'Google',
    percentage: 49,
    value: 2039,
  },
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Finstagram.com',
    name: 'Instagram',
    percentage: 23,
    value: 920,
  },
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Ffacebook.com',
    name: 'Facebook',
    percentage: 18,
    value: 750,
  },
  {
    icon: 'https://api.openpanel.dev/misc/favicon?url=https%3A%2F%2Ftwitter.com',
    name: 'Twitter',
    percentage: 10,
    value: 412,
  },
];

const COUNTRIES = [
  { icon: '🇺🇸', name: 'United States', percentage: 37, value: 1842 },
  { icon: '🇩🇪', name: 'Germany', percentage: 28, value: 1391 },
  { icon: '🇬🇧', name: 'United Kingdom', percentage: 20, value: 982 },
  { icon: '🇯🇵', name: 'Japan', percentage: 15, value: 751 },
];

export function WebAnalyticsIllustration() {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSourceIndex((prev) => (prev + 1) % TRAFFIC_SOURCES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="px-12 group aspect-video">
      <div className="relative h-full col">
        <MetricCard
          title="Session duration"
          value="3m 23s"
          change="3%"
          chartPoints={[40, 10, 20, 43, 20, 40, 30, 37, 40, 34, 50, 31]}
          color="var(--foreground)"
          className="absolute w-full rotate-0 top-2 left-2 group-hover:-translate-y-1 group-hover:-rotate-2 transition-all duration-300"
        />
        <MetricCard
          title="Bounce rate"
          value="46%"
          change="3%"
          chartPoints={[10, 46, 20, 43, 20, 40, 30, 37, 40, 34, 50, 31]}
          color="var(--foreground)"
          className="absolute w-full -rotate-2 -left-2 top-12 group-hover:-translate-y-1 group-hover:rotate-0 transition-all duration-300"
        />
        <div className="col gap-4 w-[80%] md:w-[70%] ml-auto mt-auto">
          <BarCell
            {...TRAFFIC_SOURCES[currentSourceIndex]}
            className="group-hover:scale-105 transition-all duration-300"
          />
          <BarCell
            {...TRAFFIC_SOURCES[
              (currentSourceIndex + 1) % TRAFFIC_SOURCES.length
            ]}
            className="group-hover:scale-105 transition-all duration-300"
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  change,
  chartPoints,
  color,
  className,
}: {
  title: string;
  value: string;
  change: string;
  chartPoints: number[];
  color: string;
  className?: string;
}) {
  return (
    <div className={cn('col bg-card rounded-lg p-4 pb-6 border', className)}>
      <div className="row items-end justify-between">
        <div>
          <div className="text-muted-foreground text-sm">{title}</div>
          <div className="text-2xl font-semibold font-mono">{value}</div>
        </div>
        <div className="row gap-2 items-center font-mono font-medium">
          <ArrowUpIcon className="size-3" strokeWidth={3} />
          <div>{change}</div>
        </div>
      </div>
      <SimpleChart
        width={400}
        height={30}
        points={chartPoints}
        strokeColor={color}
        className="mt-4"
      />
    </div>
  );
}

function BarCell({
  icon,
  name,
  percentage,
  value,
  className,
}: {
  icon: string;
  name: string;
  percentage: number;
  value: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative p-4 py-2 bg-card rounded-lg shadow-[0_10px_30px_rgba(0,0,0,0.3)] border',
        className,
      )}
    >
      <div
        className="absolute bg-background bottom-0 top-0 left-0 rounded-lg transition-all duration-500"
        style={{
          width: `${percentage}%`,
        }}
      />
      <div className="relative row justify-between ">
        <div className="row gap-2 items-center font-medium text-sm">
          {icon.startsWith('http') ? (
            <Image
              alt="serie icon"
              className="max-h-4 rounded-[2px] object-contain"
              src={icon}
              width={16}
              height={16}
            />
          ) : (
            <div className="text-2xl">{icon}</div>
          )}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={name}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.3 }}
            >
              {name}
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="row gap-3 font-mono text-sm">
          <span className="text-muted-foreground">
            <NumberFlow value={percentage} />%
          </span>
          <NumberFlow value={value} locales={'en-US'} />
        </div>
      </div>
    </div>
  );
}
