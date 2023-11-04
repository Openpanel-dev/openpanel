import { ColorSquare } from '@/components/ColorSquare';
import { Combobox } from '@/components/ui/combobox';
import { useOrganizationParams } from '@/hooks/useOrganizationParams';
import { useDispatch, useSelector } from '@/redux';
import type { IChartBreakdown } from '@/types';
import { api } from '@/utils/api';

import { addBreakdown, changeBreakdown, removeBreakdown } from '../reportSlice';
import { ReportBreakdownMore } from './ReportBreakdownMore';
import type { ReportEventMoreProps } from './ReportEventMore';

export function ReportBreakdowns() {
  const params = useOrganizationParams();
  const selectedBreakdowns = useSelector((state) => state.report.breakdowns);
  const dispatch = useDispatch();
  const propertiesQuery = api.chart.properties.useQuery({
    projectSlug: params.project,
  });
  const propertiesCombobox = (propertiesQuery.data ?? []).map((item) => ({
    value: item,
    label: item, // <RenderDots truncate>{item}</RenderDots>,
  }));

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
            <div key={item.name} className="rounded-lg border">
              <div className="flex items-center gap-2 p-2 px-4">
                <ColorSquare>{index}</ColorSquare>
                <Combobox
                  value={item.name}
                  onChange={(value) => {
                    dispatch(
                      changeBreakdown({
                        ...item,
                        name: value,
                      })
                    );
                  }}
                  items={propertiesCombobox}
                  placeholder="Select..."
                />
                <ReportBreakdownMore onClick={handleMore(item)} />
              </div>
            </div>
          );
        })}

        {selectedBreakdowns.length === 0 && (
          <Combobox
            value={''}
            onChange={(value) => {
              dispatch(
                addBreakdown({
                  name: value,
                })
              );
            }}
            items={propertiesCombobox}
            placeholder="Select breakdown"
          />
        )}
      </div>
    </div>
  );
}
