import { SerieIcon } from '../common/serie-icon';
import { Stat, StatStrip } from '../common/stat-strip';
import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';

type Funnel = RouterOutputs['chart']['funnel']['current'][number];

/** Which breakdown converts best and which converts most, for a funnel with breakdowns. */
export function Summary({ data }: { data: RouterOutputs['chart']['funnel'] }) {
  const number = useNumber();
  const byRate = [...data.current].sort(
    (a, b) => b.lastStep.percent - a.lastStep.percent
  );
  const byCount = [...data.current].sort(
    (a, b) => b.lastStep.count - a.lastStep.count
  );
  const bestRate = byRate[0];
  const mostConversions = byCount[0];
  if (!(bestRate && mostConversions)) {
    return null;
  }
  return (
    <StatStrip>
      <Stat
        detail={<Breakdown funnel={bestRate} />}
        label="Highest conversion rate"
        value={number.formatWithUnit(bestRate.lastStep.percent / 100, '%')}
      />
      <Stat
        detail={<Breakdown funnel={mostConversions} />}
        label="Most conversions"
        value={number.format(mostConversions.lastStep.count)}
      />
    </StatStrip>
  );
}

function Breakdown({ funnel }: { funnel: Funnel }) {
  return (
    <>
      <SerieIcon name={funnel.breakdowns} />
      <span className="truncate">{funnel.breakdowns.join(' › ')}</span>
    </>
  );
}
