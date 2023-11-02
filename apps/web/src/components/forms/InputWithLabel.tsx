import { forwardRef } from 'react';

import { Input } from '../ui/input';
import type { InputProps } from '../ui/input';
import { Label } from '../ui/label';

type InputWithLabelProps = InputProps & {
  label: string;
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ label, ...props }, ref) => {
    return (
      <div>
        <Label htmlFor={label} className="block mb-2">
          {label}
        </Label>
        <Input ref={ref} id={label} {...props} />
      </div>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
