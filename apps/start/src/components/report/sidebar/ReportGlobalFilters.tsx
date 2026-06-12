import { useDispatch, useSelector } from '@/redux';
import { shortId } from '@openpanel/common';
import { FilterIcon, type LucideIcon } from 'lucide-react';

import { addGlobalFilter } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import { GlobalFilterItem } from './filters/GlobalFilterItem';

export function ReportGlobalFilters() {
  const globalFilters = useSelector((state) => state.report.globalFilters);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Global filters</h3>
      <p className="mb-2 text-sm text-muted-foreground">
        Applied to every series in this report.
      </p>
      <div className="rounded-lg border bg-def-100">
        <div className="flex gap-2 p-2">
          <PropertiesCombobox
            categories={['event', 'profile', 'group', 'cohort', 'session']}
            onSelect={(action) => {
              const isCohortAction = action.value === 'cohort';
              if (
                isCohortAction &&
                globalFilters.some(
                  (f) =>
                    f.operator === 'inCohort' || f.operator === 'notInCohort',
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
                      },
                ),
              );
            }}
          >
            {(setOpen) => (
              <SmallButton
                onClick={() => setOpen((p) => !p)}
                icon={FilterIcon}
              >
                Add filter
              </SmallButton>
            )}
          </PropertiesCombobox>
        </div>

        {globalFilters.length > 0 && (
          <div className="flex flex-col divide-y overflow-hidden rounded-b-lg">
            {globalFilters.map((filter) => (
              <GlobalFilterItem
                key={filter.id ?? filter.name}
                filter={filter}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SmallButton({
  children,
  icon: Icon,
  ...props
}: {
  children: React.ReactNode;
  icon: LucideIcon;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none text-left min-w-0"
      {...props}
    >
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{children}</span>
    </button>
  );
}
