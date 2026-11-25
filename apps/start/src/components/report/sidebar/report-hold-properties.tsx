import { LockIcon, PlusIcon, XIcon } from 'lucide-react';
import { changeHoldProperties } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';
import {
  BuilderAddButton,
  BuilderList,
  SidebarSection,
} from './sidebar-section';
import { Button } from '@/components/ui/button';
import { useDispatch, useSelector } from '@/redux';

/**
 * Funnel and conversion "hold property constant": a user only converts when
 * every step carries the same value of each property listed here.
 */
export function ReportHoldProperties() {
  const options = useSelector((state) => state.report.options);
  const series = useSelector((state) => state.report.series);
  const dispatch = useDispatch();
  const holdProperties =
    (options?.type === 'funnel' ? options.holdProperties : undefined) ?? [];
  // A held property has to exist on every step, so the first step's
  // properties are the ones worth offering.
  const firstEvent = series.find((item) => item.type === 'event');

  return (
    <SidebarSection
      description="Only count a conversion when every step has the same value"
      title="Hold property constant"
    >
      {holdProperties.length > 0 && (
        <BuilderList>
          {holdProperties.map((property) => (
            <div className="flex items-center gap-2 px-3 py-2.5" key={property}>
              <LockIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {property}
              </span>
              <Button
                aria-label={`Stop holding ${property} constant`}
                className="size-7 shrink-0"
                onClick={() =>
                  dispatch(
                    changeHoldProperties(
                      holdProperties.filter((item) => item !== property)
                    )
                  )
                }
                size="icon"
                variant="ghost"
              >
                <XIcon className="size-4" />
              </Button>
            </div>
          ))}
        </BuilderList>
      )}
      <PropertiesCombobox
        categories={['event']}
        event={firstEvent?.type === 'event' ? firstEvent : undefined}
        exclude={holdProperties}
        onSelect={(action) => {
          dispatch(changeHoldProperties([...holdProperties, action.value]));
        }}
      >
        {(setOpen) => (
          <BuilderAddButton
            icon={PlusIcon}
            onClick={() => setOpen((prev) => !prev)}
          >
            Hold property constant
          </BuilderAddButton>
        )}
      </PropertiesCombobox>
    </SidebarSection>
  );
}
