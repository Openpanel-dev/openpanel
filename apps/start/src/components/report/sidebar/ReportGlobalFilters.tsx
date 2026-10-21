import { shortId } from '@openpanel/shared';
import { FilterIcon } from 'lucide-react';
import { addGlobalFilter } from '../reportSlice';
import { GlobalFilterItem } from './filters/GlobalFilterItem';
import { PropertiesCombobox } from './PropertiesCombobox';
import { BuilderChip, BuilderList, SidebarSection } from './sidebar-section';
import { useDispatch, useSelector } from '@/redux';

export function ReportGlobalFilters() {
  const globalFilters = useSelector((state) => state.report.globalFilters);
  const dispatch = useDispatch();

  const addFilter = (
    <PropertiesCombobox
      categories={['event', 'profile', 'group', 'cohort', 'session']}
      onSelect={(action) => {
        const isCohortAction = action.value === 'cohort';
        if (
          isCohortAction &&
          globalFilters.some(
            (f) => f.operator === 'inCohort' || f.operator === 'notInCohort'
          )
        ) {
          return;
        }
        dispatch(
          addGlobalFilter(
            isCohortAction
              ? {
                  id: shortId(),
                  name: 'cohort',
                  operator: 'inCohort',
                  value: [],
                  cohortIds: [],
                }
              : {
                  id: shortId(),
                  name: action.value,
                  operator: 'is',
                  value: [],
                  type: 'string',
                }
          )
        );
      }}
    >
      {(setOpen) => (
        <BuilderChip icon={FilterIcon} onClick={() => setOpen((p) => !p)}>
          Add filter
        </BuilderChip>
      )}
    </PropertiesCombobox>
  );

  return (
    <SidebarSection
      action={addFilter}
      description="Applied to every series in this report."
      title="Global filters"
    >
      {globalFilters.length > 0 && (
        <BuilderList>
          {globalFilters.map((filter) => (
            <GlobalFilterItem filter={filter} key={filter.id ?? filter.name} />
          ))}
        </BuilderList>
      )}
    </SidebarSection>
  );
}
