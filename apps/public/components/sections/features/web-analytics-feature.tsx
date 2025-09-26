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

export function WebAnalyticsFeature() {
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [currentCountryIndex, setCurrentCountryIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentSourceIndex((prev) => (prev + 1) % TRAFFIC_SOURCES.length);
      setCurrentCountryIndex((prev) => (prev + 1) % COUNTRIES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 relative col gap-4">
      <div className="relative">
        <MetricCard
          title="Session duration"
          value="3m 23s"
          change="3%"
          chartPoints={[40, 10, 20, 43, 20, 40, 30, 37, 40, 34, 50, 31]}
          color="hsl(var(--red))"
          className="w-full rotate-3 -left-2 hover:-translate-y-1 transition-all duration-300"
        />
        <MetricCard
          title="Bounce rate"
          value="46%"
          change="3%"
          chartPoints={[10, 46, 20, 43, 20, 40, 30, 37, 40, 34, 50, 31]}
          color="hsl(var(--green))"
          className="w-full -mt-8 -rotate-2 left-2 top-14 hover:-translate-y-1 transition-all duration-300"
        />
      </div>
      <div>
        <div className="-rotate-2 bg-background-light rounded-lg col gap-2 p-2 shadow-lg">
          <BarCell {...TRAFFIC_SOURCES[currentSourceIndex]} />
          <BarCell
            {...TRAFFIC_SOURCES[
              (currentSourceIndex + 1) % TRAFFIC_SOURCES.length
            ]}
          />
        </div>
        <div className="rotate-1 bg-background-light rounded-lg col gap-2 p-2 shadow-lg">
          <BarCell {...COUNTRIES[currentCountryIndex]} />
          <BarCell
            {...COUNTRIES[(currentCountryIndex + 1) % COUNTRIES.length]}
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
    <div
      className={cn(
        'row items-end bg-background-light rounded-lg p-4 pb-6 border justify-between',
        className,
      )}
    >
      <div>
        <div className="text-muted-foreground text-xl">{title}</div>
        <div className="text-5xl font-bold font-mono">{value}</div>
      </div>
      <div className="row gap-2 items-center font-mono font-medium text-lg">
        <div
          className="size-6 rounded-full flex items-center justify-center"
          style={{
            background: color,
          }}
        >
          <ArrowUpIcon className="size-4" strokeWidth={3} />
        </div>
        <div>{change}</div>
      </div>
      <SimpleChart
        width={500}
        height={30}
        points={chartPoints}
        className="absolute bottom-0 left-0 right-0"
        strokeColor={color}
      />
    </div>
  );
}

function BarCell({
  icon,
  name,
  percentage,
  value,
}: {
  icon: string;
  name: string;
  percentage: number;
  value: number;
}) {
  return (
    <div className="relative p-2">
      <div
        className="absolute bg-background-dark bottom-0 top-0 left-0 rounded-lg transition-all duration-500"
        style={{
          width: `${percentage}%`,
        }}
      />
      <div className="relative row justify-between ">
        <div className="row gap-2 items-center font-medium">
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
        <div className="row gap-3 font-mono">
          <span className="text-muted-foreground">
            <NumberFlow value={percentage} />%
          </span>
          <NumberFlow value={value} locales={'en-US'} />
        </div>
      </div>
    </div>
  );
}
