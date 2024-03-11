import { forwardRef } from 'react';

import { Input } from '../ui/input';
import type { InputProps } from '../ui/input';
import { Label } from '../ui/label';

type InputWithLabelProps = InputProps & {
  label: string;
  error?: string | undefined;
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ label, className, ...props }, ref) => {
    return (
      <div className={className}>
        <div className="block mb-2 flex justify-between">
          <Label className="mb-0" htmlFor={label}>
            {label}
          </Label>
          {props.error && (
            <span className="text-sm text-destructive leading-none">
              {props.error}
            </span>
          )}
        </div>
        <Input ref={ref} id={label} {...props} />
      </div>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
