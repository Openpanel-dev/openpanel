import { forwardRef } from 'react';
import { cn } from '@/utils/cn';
import { slug } from '@/utils/slug';
import type { LucideIcon } from 'lucide-react';
import type { ControllerRenderProps } from 'react-hook-form';

import { Switch } from '../ui/switch';

type Props = {
  label: string;
  description: string;
  Icon: LucideIcon;
  children?: React.ReactNode;
  error?: string;
} & ControllerRenderProps;

export const CheckboxItem = forwardRef<HTMLButtonElement, Props>(
  (
    { label, description, Icon, children, onChange, value, disabled, error },
    ref
  ) => {
    const id = slug(label);
    return (
      <div>
        <label
          className={cn(
            'flex items-center gap-4 px-4 py-6 transition-colors hover:bg-slate-100',
            disabled && 'cursor-not-allowed opacity-50'
          )}
          htmlFor={id}
        >
          {Icon && <div className="w-6 shrink-0">{<Icon />}</div>}
          <div className="flex-1">
            <div className="font-medium">{label}</div>
            <div className="text-sm text-muted-foreground">{description}</div>
            {error && <div className="text-xs text-red-600">{error}</div>}
          </div>
          <div>
            <Switch
              ref={ref}
              disabled={disabled}
              checked={!!value}
              onCheckedChange={onChange}
              id={id}
            />
          </div>
        </label>
        {children}
      </div>
    );
  }
);

CheckboxItem.displayName = 'CheckboxItem';
