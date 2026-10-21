import type { IChartBreakdown } from '@openpanel/core/modules/report/report.constants';
import { ChevronsUpDownIcon, PlusIcon, SplitIcon } from 'lucide-react';
import { addBreakdown, changeBreakdown, removeBreakdown } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { ReportBreakdownMore } from './ReportBreakdownMore';
import type { ReportEventMoreProps } from './ReportEventMore';
import { BuilderChip, BuilderList, SidebarSection } from './sidebar-section';
import { ColorSquare } from '@/components/color-square';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { useDispatch, useSelector } from '@/redux';

export function ReportBreakdowns() {
  const selectedBreakdowns = useSelector((state) => state.report.breakdowns);
  const chartType = useSelector((state) => state.report.chartType);
  const series = useSelector((state) => state.report.series);
  const dispatch = useDispatch();
  const stepItems = series
    .filter((item) => item.type === 'event')
    .map((item, index) => ({
      label: `${index + 1}. ${item.displayName || item.name}`,
      value: String(index + 1),
    }));
  const showStep = chartType === 'funnel' && stepItems.length > 1;

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

  const addBreakdownAction = (
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
        <BuilderChip icon={PlusIcon} onClick={() => setOpen((prev) => !prev)}>
          Add breakdown
        </BuilderChip>
      )}
    </PropertiesCombobox>
  );

  return (
    <SidebarSection action={addBreakdownAction} title="Breakdown">
      {selectedBreakdowns.length > 0 && (
        <BuilderList>
          {selectedBreakdowns.map((item, index) => {
            return (
              <div key={item.name}>
                <div className="flex items-center gap-2 px-3 py-2.5">
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
                        className="min-w-0 flex-1"
                        onClick={() => setOpen((prev) => !prev)}
                        size="default"
                        variant="input"
                      >
                        <div className="row w-full min-w-0 items-center gap-2">
                          <SplitIcon className="size-4 shrink-0" />
                          <span className="truncate">
                            {item.name === 'cohort' ? 'Cohorts' : item.name}
                          </span>
                        </div>
                        <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    )}
                  </PropertiesCombobox>
                  <ReportBreakdownMore onClick={handleMore(item)} />
                </div>
                {showStep && !item.name.startsWith('group.') && (
                  <div className="flex items-center justify-between gap-2 border-t px-3 py-2 pl-10">
                    <span className="text-muted-foreground text-sm">
                      From step
                    </span>
                    <Combobox
                      align="end"
                      items={stepItems}
                      onChange={(value) =>
                        dispatch(
                          changeBreakdown({
                            ...item,
                            step: value === '1' ? undefined : Number(value),
                          })
                        )
                      }
                      placeholder="Select step"
                      size="sm"
                      value={String(
                        item.step && item.step <= stepItems.length
                          ? item.step
                          : 1
                      )}
                      variant="input"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </BuilderList>
      )}
    </SidebarSection>
  );
}
