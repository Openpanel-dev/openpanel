import { motion, useSpring } from 'motion/react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { differenceInHours, getISOWeek } from 'date-fns';
import type { IInterval } from '@openpanel/validation';
import {
  type TooltipData,
  useChartHover,
  useChartStable,
} from './chart-context';

// Near-instant — original 300/30 felt sluggish snapping between data points.
const SPRING = { stiffness: 1000, damping: 60 };

interface OPDatePillProps {
  /** Interval drives format selection together with the data span. */
  interval?: IInterval;
}

/**
 * Compact date pill drawn at the bottom of the chart, replacing bklit's
 * `<DateTicker>` so we can (a) format the label based on `interval` + data span,
 * and (b) use OpenPanel's smaller type scale.
 *
 * Visibility guard sits in the outer wrapper; the inner component (which
 * owns the `useSpring`) only mounts when `tooltipData` exists, so the
 * spring initializes at the cursor's actual position. Without this split
 * the spring would init at `margin.left` (with `tooltipData` null) and
 * have to slide across the chart on first hover — pill looks like it
 * "fades in from the left edge".
 */
export function OPDatePill({ interval }: OPDatePillProps) {
  const { containerRef } = useChartStable();
  const { tooltipData } = useChartHover();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !containerRef.current || !tooltipData) {
    return null;
  }

  return (
    <OPDatePillInner
      container={containerRef.current}
      interval={interval}
      tooltipData={tooltipData}
    />
  );
}

OPDatePill.displayName = 'OPDatePill';

function OPDatePillInner({
  container,
  interval,
  tooltipData,
}: {
  container: HTMLElement;
  interval?: IInterval;
  tooltipData: TooltipData;
}) {
  const { data, xAccessor, margin, width } = useChartStable();

  const xCenter = tooltipData.x + margin.left;
  const animatedX = useSpring(xCenter, SPRING);
  animatedX.set(xCenter);

  const label = useMemo(
    () =>
      formatPillDate(
        xAccessor(tooltipData.point),
        interval ?? 'day',
        data,
        xAccessor,
      ),
    [tooltipData, data, xAccessor, interval],
  );

  // Stable across hovers — depends only on chart dimensions.
  const maxWidth = useMemo(
    () => Math.max(120, width - margin.left - margin.right),
    [width, margin.left, margin.right],
  );

  if (!label) return null;

  return createPortal(
    <motion.div
      className="pointer-events-none absolute z-50"
      style={{
        left: animatedX,
        bottom: 4,
        transform: 'translateX(-50%)',
        maxWidth,
      }}
    >
      <div className="rounded-full bg-foreground px-2.5 py-1 text-[11px] font-medium tracking-tight text-background shadow-md whitespace-nowrap">
        {label}
      </div>
    </motion.div>,
    container,
  );
}

const SHORT_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function formatPillDate(
  date: Date,
  interval: IInterval,
  data: Record<string, unknown>[],
  xAccessor: (d: Record<string, unknown>) => Date,
): string {
  const first = data[0] ? xAccessor(data[0]) : date;
  const last = data[data.length - 1] ? xAccessor(data[data.length - 1]!) : date;
  const spanHours = Math.max(0, differenceInHours(last, first));

  const dayMonth = `${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  switch (interval) {
    case 'minute':
      if (spanHours <= 1) return time;
      if (spanHours <= 24) return time;
      return `${dayMonth} ${time}`;

    case 'hour':
      // ≤ ~25h span → single day, show only the hour
      if (spanHours <= 25) return `${pad(date.getHours())}:00`;
      // Otherwise include the date
      return `${dayMonth} ${pad(date.getHours())}:00`;

    case 'day':
      // ≤ 14 days → include weekday, otherwise just the date
      if (spanHours <= 24 * 14) {
        return `${SHORT_WEEKDAYS[date.getDay()]}, ${dayMonth}`;
      }
      return dayMonth;

    case 'week':
      return `W${getISOWeek(date)} · ${dayMonth}`;

    case 'month':
      return `${SHORT_MONTHS[date.getMonth()]} ${date.getFullYear()}`;

    default:
      return dayMonth;
  }
}
