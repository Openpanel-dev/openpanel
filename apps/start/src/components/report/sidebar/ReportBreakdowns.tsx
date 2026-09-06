import type { IChartBreakdown } from '@openpanel/core/modules/report/report.constants';
import { ChevronsUpDownIcon, SplitIcon } from 'lucide-react';
import { addBreakdown, changeBreakdown, removeBreakdown } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { ReportBreakdownMore } from './ReportBreakdownMore';
import type { ReportEventMoreProps } from './ReportEventMore';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { useDispatch, useSelector } from '@/redux';

export function ReportBreakdowns() {
  const selectedBreakdowns = useSelector((state) => state.report.breakdowns);
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
          return (
            <div className="rounded-lg border bg-def-100" key={item.name}>
              <div className="flex items-center gap-2 p-2 px-4">
                <ColorSquare>{index}</ColorSquare>
                <PropertiesCombobox
                  categories={['event', 'profile', 'group', 'cohort']}
                  onSelect={(action) => {
                    dispatch(
                      changeBreakdown({
                        ...item,
                        name: action.value,
                      })
                    );
                  }}
                >
                  {(setOpen) => (
                    <Button
                      autoHeight
                      className="flex-1"
                      onClick={() => setOpen((prev) => !prev)}
                      size={'sm'}
                      variant={'outline'}
                    >
                      <div className="row w-full items-center gap-2">
                        <SplitIcon className="size-4" />
                        {item.name === 'cohort' ? 'Cohorts' : item.name}
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
          categories={['event', 'profile', 'group', 'cohort']}
          onSelect={(action) => {
            dispatch(
              addBreakdown({
                name: action.value,
              })
            );
          }}
        >
          {(setOpen) => (
            <Button
              autoHeight
              className="flex-1"
              onClick={() => setOpen((prev) => !prev)}
              size={'sm'}
              variant={'outline'}
            >
              <div className="row w-full items-center gap-2">
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
