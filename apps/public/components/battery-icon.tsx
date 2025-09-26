'use client';

import {
  BatteryFullIcon,
  BatteryLowIcon,
  BatteryMediumIcon,
  type LucideProps,
} from 'lucide-react';
import { useEffect, useState } from 'react';

export function BatteryIcon(props: LucideProps) {
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
    return <div className={props.className} />;
  }

  return <Icon {...props} />;
}
