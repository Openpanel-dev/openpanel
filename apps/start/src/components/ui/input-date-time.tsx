import { format, isValid, parseISO } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { type InputHTMLAttributes, useEffect, useState } from 'react';
import { WithLabel } from '../forms/input-with-label';
import { Input } from './input';
import { pushModal } from '@/modals';

export function InputDateTime({
  value,
  onChange,
  placeholder = 'Select date and time',
  label,
  ...props
}: {
  value: string | undefined;
  onChange: (value: string) => void;
  label: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  const [internalValue, setInternalValue] = useState(value ?? '');

  useEffect(() => {
    if (value !== internalValue) {
      setInternalValue(value ?? '');
    }
  }, [value]);

  // Convert string to Date for modal
  const getDateFromValue = (dateString: string): Date => {
    if (!dateString) {
      return new Date();
    }

    try {
      const date = parseISO(dateString);
      return isValid(date) ? date : new Date();
    } catch {
      return new Date();
    }
  };

  // Format date for display
  const getDisplayValue = (dateString: string): string => {
    if (!dateString) {
      return '';
    }

    try {
      const date = parseISO(dateString);
      return isValid(date) ? format(date, 'MM/dd/yyyy HH:mm') : dateString;
    } catch {
      return dateString;
    }
  };

  const handleDateTimeSelect = () => {
    pushModal('DateTimePicker', {
      initialDate: getDateFromValue(value || ''),
      title: 'Select Date & Time',
      onChange: (selectedDate: Date) => {
        const isoString = selectedDate.toISOString();
        setInternalValue(isoString);
        onChange(isoString);
      },
    });
  };

  return (
    <WithLabel label={label}>
      <div
        className="relative w-full cursor-pointer"
        onClick={handleDateTimeSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            handleDateTimeSelect();
          }
        }}
      >
        <Input
          {...props}
          className="cursor-pointer pr-10"
          placeholder={placeholder}
          readOnly
          size="default"
          value={getDisplayValue(value || '')}
        />
        <div className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2">
          <CalendarIcon className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </WithLabel>
  );
}
