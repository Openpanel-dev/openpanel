import { shortId } from '@openpanel/shared';
import { FilterIcon } from 'lucide-react';
import { addGlobalFilter } from '../reportSlice';
import { GlobalFilterItem } from './filters/GlobalFilterItem';
import { PropertiesCombobox } from './PropertiesCombobox';
import { BuilderAddButton, SidebarSection } from './sidebar-section';
import {
  TranslationText as DashboardText,
  useTranslation as useDashboardTranslation,
} from '@/i18n/provider';
import { useDispatch, useSelector } from '@/redux';

export function ReportGlobalFilters() {
  const { t: translateUi } = useDashboardTranslation();

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
        <BuilderAddButton icon={FilterIcon} onClick={() => setOpen((p) => !p)}>
          <DashboardText i18nKey={'Add filter'} />{' '}
        </BuilderAddButton>
      )}
    </PropertiesCombobox>
  );

  return (
    <SidebarSection
      description={translateUi('Applied to every series in this report.')}
      title={translateUi('Global filters')}
    >
      {globalFilters.map((filter) => (
        <GlobalFilterItem filter={filter} key={filter.id ?? filter.name} />
      ))}
      {addFilter}
    </SidebarSection>
  );
}
