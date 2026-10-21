import { InfoIcon } from 'lucide-react';
import { forwardRef } from 'react';
import type { InputProps } from '../ui/input';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltiper } from '../ui/tooltip';
import { cn } from '@/utils/cn';

interface WithLabel {
  children: React.ReactNode;
  label: string;
  error?: string | undefined;
  /** Shown under the field; replaced by the error while there is one. */
  hint?: React.ReactNode;
  info?: React.ReactNode;
  className?: string;
}
type InputWithLabelProps = InputProps & Omit<WithLabel, 'children'>;

function fieldMessageId(label: string) {
  return `${label}-message`;
}

export const WithLabel = ({
  children,
  className,
  label,
  hint,
  info,
  error,
}: WithLabel) => {
  const message = error ?? hint;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="mb-0 flex items-center gap-1" htmlFor={label}>
        {label}
        {info && (
          <Tooltiper content={info}>
            <InfoIcon className="text-muted-foreground" size={14} />
          </Tooltiper>
        )}
      </Label>
      {children}
      {message && (
        <p
          aria-live="polite"
          className={cn(
            'text-xs',
            error ? 'text-destructive' : 'text-muted-foreground'
          )}
          data-slot={error ? 'field-error' : 'field-hint'}
          id={fieldMessageId(label)}
        >
          {message}
        </p>
      )}
    </div>
  );
};

export const InputWithLabel = forwardRef<HTMLInputElement, InputWithLabelProps>(
  ({ className, label, hint, info, error, ...inputProps }, ref) => {
    const hasMessage = Boolean(error ?? hint);
    return (
      <WithLabel
        className={className}
        error={error}
        hint={hint}
        info={info}
        label={label}
      >
        <Input
          aria-describedby={hasMessage ? fieldMessageId(label) : undefined}
          error={error}
          id={label}
          ref={ref}
          {...inputProps}
        />
      </WithLabel>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
