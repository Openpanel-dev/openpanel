import { forwardRef } from 'react';
import { BanIcon, InfoIcon } from 'lucide-react';

import { Input } from '../ui/input';
import type { InputProps } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltiper } from '../ui/tooltip';

type WithLabel = {
  children: React.ReactNode;
  label: string;
  error?: string | undefined;
  info?: string;
  className?: string;
};
type InputWithLabelProps = InputProps & Omit<WithLabel, 'children'>;

export const WithLabel = ({
  children,
  className,
  label,
  info,
  error,
}: WithLabel) => {
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
        {error && (
          <Tooltiper asChild content={error}>
            <div className="flex items-center gap-1  leading-none text-destructive">
              Issues
              <BanIcon size={14} />
            </div>
          </Tooltiper>
        )}
      </div>
      {children}
    </div>
  );
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  (props, ref) => {
    return (
      <WithLabel {...props}>
        <Input ref={ref} id={props.label} {...props} />
      </WithLabel>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
