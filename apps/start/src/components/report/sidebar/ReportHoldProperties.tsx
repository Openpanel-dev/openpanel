import { useDispatch, useSelector } from '@/redux';
import { LockIcon, XIcon } from 'lucide-react';

import { addHoldProperty, removeHoldProperty } from '../reportSlice';
import { PropertiesCombobox } from './PropertiesCombobox';

export function ReportHoldProperties() {
  const holdProperties = useSelector((state) => state.report.holdProperties);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Hold Property Constant</h3>
      <div className="flex flex-col gap-2">
        {holdProperties.map((prop) => (
          <div
            key={prop}
            className="flex items-center gap-2 rounded-lg border bg-def-100 p-2 px-4"
          >
            <LockIcon className="size-3" />
            <span className="flex-1 text-sm">
              {prop.split('.').pop() ?? prop}
            </span>
            <button
              type="button"
              onClick={() => dispatch(removeHoldProperty(prop))}
              className="text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        ))}

        <PropertiesCombobox
          onSelect={(action) => {
            dispatch(addHoldProperty(action.value));
          }}
          exclude={holdProperties}
          mode="events"
        >
          {(setOpen) => (
            <button
              onClick={() => setOpen((p) => !p)}
              type="button"
              className="flex items-center gap-1 rounded-md border border-border bg-card p-1 px-2 text-sm font-medium leading-none"
            >
              <LockIcon size={12} /> Hold property constant
            </button>
          )}
        </PropertiesCombobox>
      </div>
    </div>
  );
}
