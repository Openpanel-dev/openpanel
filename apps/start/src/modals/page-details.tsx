import { GscBreakdownTable } from '@/components/page/gsc-breakdown-table';
import { GscClicksChart } from '@/components/page/gsc-clicks-chart';
import { PageViewsChart } from '@/components/page/page-views-chart';
import { SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

type Props = {
  type: 'page' | 'query';
  projectId: string;
  value: string;
};

export default function PageDetails({ type, projectId, value }: Props) {
  return (
    <SheetContent className="flex flex-col gap-6 overflow-y-auto sm:max-w-xl">
      <SheetHeader>
        <SheetTitle className="truncate pr-8 font-medium font-mono text-sm">
          {value}
        </SheetTitle>
      </SheetHeader>

      <div className="col gap-6">
        {type === 'page' &&
          (() => {
            let origin = value;
            let path = '/';
            try {
              const url = new URL(value);
              origin = url.origin;
              path = url.pathname + url.search;
            } catch {
              // value might already be just a path
            }
            return (
              <PageViewsChart
                origin={origin}
                path={path}
                projectId={projectId}
              />
            );
          })()}
        <GscClicksChart projectId={projectId} type={type} value={value} />
        <GscBreakdownTable projectId={projectId} type={type} value={value} />
      </div>
    </SheetContent>
  );
}
