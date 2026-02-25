import { Button } from '@/components/ui/button';
import type { RouterOutputs } from '@/trpc/client';
import {
  chartDataToCSV,
  cohortDataToCSV,
  conversionDataToCSV,
  downloadCSV,
  funnelDataToCSV,
} from '@/utils/csv-download';
import { DownloadIcon } from 'lucide-react';

type Props =
  | {
      type: 'standard';
      data: RouterOutputs['chart']['chart'];
      filename?: string;
    }
  | {
      type: 'funnel';
      data: RouterOutputs['chart']['funnel'];
      filename?: string;
    }
  | {
      type: 'cohort';
      data: RouterOutputs['chart']['cohort'];
      filename?: string;
    }
  | {
      type: 'conversion';
      data: RouterOutputs['chart']['conversion'];
      filename?: string;
    };

export function ChartDownloadButton({ type, data, filename = 'chart' }: Props) {
  const handleDownload = () => {
    let csv: string;
    switch (type) {
      case 'standard':
        csv = chartDataToCSV(data);
        break;
      case 'funnel':
        csv = funnelDataToCSV(data);
        break;
      case 'cohort':
        csv = cohortDataToCSV(data);
        break;
      case 'conversion':
        csv = conversionDataToCSV(data);
        break;
    }
    downloadCSV(csv, `${filename}.csv`);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="absolute top-2 right-2 z-10 opacity-0 group-hover/chart:opacity-100 transition-opacity"
      onClick={handleDownload}
      title="Download CSV"
    >
      <DownloadIcon className="h-4 w-4" />
    </Button>
  );
}
