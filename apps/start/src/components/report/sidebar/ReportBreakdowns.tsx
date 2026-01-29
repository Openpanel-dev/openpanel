import { ColorSquare } from '@/components/color-square';
import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/use-app-params';
import { useEventProperties } from '@/hooks/use-event-properties';
import { useCohorts } from '@/hooks/use-cohorts';
import { useDispatch, useSelector } from '@/redux';
import { ChevronsUpDownIcon, SplitIcon, UsersIcon } from 'lucide-react';

import type { IChartBreakdown } from '@openpanel/validation';

import { Button } from '@/components/ui/button';
import { addBreakdown, changeBreakdown, removeBreakdown } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { ReportBreakdownMore } from './ReportBreakdownMore';
import type { ReportEventMoreProps } from './ReportEventMore';

export function ReportBreakdowns() {
  const { projectId } = useAppParams();
  const selectedBreakdowns = useSelector((state) => state.report.breakdowns);
  const cohorts = useCohorts({ projectId, includeCount: false });
  const dispatch = useDispatch();

  const handleMore = (breakdown: IChartBreakdown) => {
    const callback: ReportEventMoreProps['onClick'] = (action) => {
      switch (action) {
        case 'remove': {
          return dispatch(removeBreakdown(breakdown));
        }
      }
    };

    return callback;
  };

  return (
    <div>
      <h3 className="mb-2 font-medium">Breakdown</h3>
      <div className="flex flex-col gap-4">
        {selectedBreakdowns.map((item, index) => {
          const isCohortBreakdown = item.name.startsWith('cohort:');
          const cohortId = isCohortBreakdown
            ? (item.cohortId || item.name.split(':')[1])
            : null;
          const cohort = cohortId ? cohorts.find(c => c.id === cohortId) : null;
          const displayName = cohort ? cohort.name : item.name;

          return (
            <div key={item.id || item.name} className="rounded-lg border bg-def-100">
              <div className="flex items-center gap-2 p-2 px-4">
                <ColorSquare>{index}</ColorSquare>
                <PropertiesCombobox
                  onSelect={(action) => {
                    dispatch(
                      changeBreakdown({
                        ...item,
                        name: action.value,
                        cohortId: action.cohortId,
                      }),
                    );
                  }}
                >
                  {(setOpen) => (
                    <Button
                      variant={'outline'}
                      onClick={() => setOpen((prev) => !prev)}
                      size={'sm'}
                      autoHeight
                      className="flex-1"
                    >
                      <div className="row w-full gap-2 items-center">
                        {isCohortBreakdown
                          ? <UsersIcon className="size-4" />
                          : <SplitIcon className="size-4" />
                        }
                        {displayName}
                      </div>
                      <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  )}
                </PropertiesCombobox>
                <ReportBreakdownMore onClick={handleMore(item)} />
              </div>
            </div>
          );
        })}

        <PropertiesCombobox
          onSelect={(action) => {
            dispatch(
              addBreakdown({
                name: action.value,
                cohortId: action.cohortId,
              }),
            );
          }}
        >
          {(setOpen) => (
            <Button
              variant={'outline'}
              onClick={() => setOpen((prev) => !prev)}
              size={'sm'}
              autoHeight
              className="flex-1"
            >
              <div className="row w-full gap-2 items-center">
                <SplitIcon className="size-4" />
                Select breakdown
              </div>
              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          )}
        </PropertiesCombobox>
      </div>
    </div>
  );
}
