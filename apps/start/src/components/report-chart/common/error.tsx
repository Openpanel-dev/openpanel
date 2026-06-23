import { cn } from '@/utils/cn';
import { ServerCrashIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useReportChartContext } from '../context';

export function ReportChartError() {
  const { t } = useTranslation();
  const { isEditMode } = useReportChartContext();
  return (
    <div
      className={cn(
        'center-center h-full w-full flex-col',
        isEditMode && 'card p-4',
      )}
    >
      <ServerCrashIcon
        strokeWidth={1.2}
        className="mb-4 size-10 animate-pulse text-muted-foreground"
      />
      <div className="text-sm font-medium text-muted-foreground">
        {t('report_chart.chart_load_error')}
      </div>
    </div>
  );
}
