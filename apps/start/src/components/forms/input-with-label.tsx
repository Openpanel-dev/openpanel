import { BanIcon, InfoIcon } from 'lucide-react';
import { forwardRef } from 'react';
import type { InputProps } from '../ui/input';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltiper } from '../ui/tooltip';

interface WithLabel {
  children: React.ReactNode;
  label: string;
  error?: string | undefined;
  info?: React.ReactNode;
  className?: string;
}
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
          <Tooltiper
            align="end"
            asChild
            content={error}
            tooltipClassName="max-w-80 leading-normal"
          >
            <div className="flex items-center gap-1 text-destructive leading-none">
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
        <Input id={props.label} ref={ref} {...props} />
      </WithLabel>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
