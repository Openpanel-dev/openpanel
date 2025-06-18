'use client';

import {
  BatteryFullIcon,
  BatteryLowIcon,
  BatteryMediumIcon,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export function BatteryIcon({ className }: { className?: string }) {
  const [index, setIndex] = useState(0);
  const icons = [BatteryLowIcon, BatteryMediumIcon, BatteryFullIcon];

  const Icon = icons[index];

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((index + 1) % icons.length);
    }, 750);
    return () => clearInterval(interval);
  }, [index]);

  if (!Icon) {
    return <div className={className} />;
  }

  return <Icon className={className} />;
}
