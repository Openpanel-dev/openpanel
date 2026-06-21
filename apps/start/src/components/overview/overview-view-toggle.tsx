import { LineChartIcon, TableIcon } from 'lucide-react';
import { parseAsStringEnum, useQueryState } from 'nuqs';
import { useTranslation } from 'react-i18next';

import { Button } from '../ui/button';

type ViewType = 'table' | 'chart';

interface OverviewViewToggleProps {
  defaultView?: ViewType;
  className?: string;
}

export function OverviewViewToggle({
  defaultView = 'table',
  className,
}: OverviewViewToggleProps) {
  const { t } = useTranslation();
  const [view, setView] = useQueryState<ViewType>(
    'view',
    parseAsStringEnum(['table', 'chart'])
      .withDefault(defaultView)
      .withOptions({ history: 'push' }),
  );

  return (
    <div className={className}>
      <Button
        size="icon"
        variant="ghost"
        onClick={() => {
          setView(view === 'table' ? 'chart' : 'table');
        }}
        title={
          view === 'table'
            ? t('overview.switch_to_chart_view')
            : t('overview.switch_to_table_view')
        }
      >
        {view === 'table' ? (
          <LineChartIcon size={16} />
        ) : (
          <TableIcon size={16} />
        )}
      </Button>
    </div>
  );
}

export function useOverviewView() {
  const [view, setView] = useQueryState<ViewType>(
    'view',
    parseAsStringEnum(['table', 'chart'])
      .withDefault('table')
      .withOptions({ history: 'push' }),
  );

  return [view, setView] as const;
}
