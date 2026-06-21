import { cn } from '@/utils/cn';
import {
  BirdIcon,
  CornerLeftUpIcon,
  ForkliftIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReportChartContext } from '../context';

export function ReportChartEmpty({
  title,
  children,
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const {
    isEditMode,
    report: { series },
  } = useReportChartContext();

  if (!series || series.length === 0) {
    return (
      <div className="card p-4 center-center h-full w-full flex-col relative">
        <div className="row gap-2 items-end absolute top-4 left-4">
          <CornerLeftUpIcon
            strokeWidth={1.2}
            className="size-8 animate-pulse text-muted-foreground"
          />
          <div className="text-muted-foreground">
            {t('report_chart.start_here')}
          </div>
        </div>
        <ForkliftIcon
          strokeWidth={1.2}
          className="mb-4 size-1/3 max-w-40 animate-pulse text-muted-foreground"
        />
        <div className="font-medium text-muted-foreground">
          {t('report_chart.ready_when_you_are')}
        </div>
        <div className="text-muted-foreground mt-2">
          {t('report_chart.pick_event_to_start')}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'center-center h-full w-full flex-col',
        isEditMode && 'card p-4',
      )}
    >
      <BirdIcon
        strokeWidth={1.2}
        className="mb-4 size-1/3 animate-pulse text-muted-foreground"
      />
      <div className="font-medium text-muted-foreground">
        {title ?? t('report_chart.no_data')}
      </div>
      <div className="text-muted-foreground mt-2">{children}</div>
    </div>
  );
}
