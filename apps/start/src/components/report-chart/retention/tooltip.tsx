import { useNumber } from '@/hooks/use-numer-formatter';
import type { RouterOutputs } from '@/trpc/client';
import { useTranslation } from 'react-i18next';
import { useReportChartContext } from '../context';

type Props = {
  active?: boolean;
  payload?: Array<{
    payload: any;
  }>;
};
export function RetentionTooltip({ active, payload }: Props) {
  const { t } = useTranslation();
  const {
    report: { interval },
  } = useReportChartContext();
  const number = useNumber();
  if (!active) {
    return null;
  }

  if (!payload?.[0]) {
    return null;
  }

  const { days, percentage, value, sum } = payload[0].payload;

  return (
    <div className="flex min-w-[200px] flex-col gap-2 rounded-xl border bg-card p-3 shadow-xl">
      <h3 className="font-semibold capitalize">
        {interval} {days}
      </h3>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {t('report_chart.retention_rate')}:
        </span>
        <span className="font-medium">
          {number.formatWithUnit(percentage / 100, '%')}
        </span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {t('report_chart.retained_users')}:
        </span>
        <span className="font-medium">{number.format(value)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-muted-foreground">
          {t('report_chart.total_users')}:
        </span>
        <span className="font-medium">{number.format(sum)}</span>
      </div>
    </div>
  );
}
