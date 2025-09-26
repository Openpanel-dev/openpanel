'use client';

import { ColorSquare } from '@/components/color-square';
import { Combobox } from '@/components/ui/combobox';
import { useAppParams } from '@/hooks/useAppParams';
import { useEventProperties } from '@/hooks/useEventProperties';
import { useDispatch, useSelector } from '@/redux';
import { ChevronsUpDownIcon, SplitIcon } from 'lucide-react';

import type { IChartBreakdown } from '@openpanel/validation';

import { Button } from '@/components/ui/button';
import { addBreakdown, changeBreakdown, removeBreakdown } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { ReportBreakdownMore } from './ReportBreakdownMore';
import type { ReportEventMoreProps } from './ReportEventMore';

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
            <div key={item.name} className="rounded-lg border bg-def-100">
              <div className="flex items-center gap-2 p-2 px-4">
                <ColorSquare>{index}</ColorSquare>
                <PropertiesCombobox
                  onSelect={(action) => {
                    dispatch(
                      changeBreakdown({
                        ...item,
                        name: action.value,
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
                        {item.name}
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
