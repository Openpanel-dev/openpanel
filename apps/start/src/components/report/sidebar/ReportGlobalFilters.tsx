import { shortId } from '@openpanel/shared';
import { FilterIcon, type LucideIcon } from 'lucide-react';
import { addGlobalFilter } from '../reportSlice';
import { GlobalFilterItem } from './filters/GlobalFilterItem';
import { PropertiesCombobox } from './PropertiesCombobox';
import { useDispatch, useSelector } from '@/redux';

export function ReportGlobalFilters() {
  const globalFilters = useSelector((state) => state.report.globalFilters);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Global filters</h3>
      <p className="mb-2 text-muted-foreground text-sm">
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
                    f.operator === 'inCohort' || f.operator === 'notInCohort'
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
              <SmallButton icon={FilterIcon} onClick={() => setOpen((p) => !p)}>
                Add filter
              </SmallButton>
            )}
          </PropertiesCombobox>
        </div>

        {globalFilters.length > 0 && (
          <div className="flex flex-col divide-y overflow-hidden rounded-b-lg">
            {globalFilters.map((filter) => (
              <GlobalFilterItem
                filter={filter}
                key={filter.id ?? filter.name}
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
      className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-left font-medium text-sm leading-none"
      type="button"
      {...props}
    >
      <Icon className="shrink-0" size={12} />
      <span className="truncate">{children}</span>
    </button>
  );
}
