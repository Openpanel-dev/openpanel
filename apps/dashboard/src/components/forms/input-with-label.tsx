import { forwardRef } from 'react';
import { BanIcon, InfoIcon } from 'lucide-react';

import { Input } from '../ui/input';
import type { InputProps } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltiper } from '../ui/tooltip';

type InputWithLabelProps = InputProps & {
  label: string;
  error?: string | undefined;
  info?: string;
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ label, className, info, ...props }, ref) => {
    return (
      <div className={className}>
        <div className="mb-2 flex items-end justify-between">
          <Label
            className="mb-0 flex flex-1 shrink-0 items-center gap-1 whitespace-nowrap"
            htmlFor={label}
          >
            {label}
            {info && (
              <Tooltiper content={info}>
                <InfoIcon size={14} />
              </Tooltiper>
            )}
          </Label>
          {props.error && (
            <Tooltiper asChild content={props.error}>
              <div className="flex items-center gap-1 text-sm leading-none text-destructive">
                Issues
                <BanIcon size={14} />
              </div>
            </Tooltiper>
          )}
        </div>
        <Input ref={ref} id={label} {...props} />
      </div>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
