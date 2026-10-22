import { InfoIcon } from 'lucide-react';
import { forwardRef, useId } from 'react';
import type { InputProps } from '../ui/input';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Tooltiper } from '../ui/tooltip';
import { cn } from '@/utils/cn';

interface WithLabel {
  children: React.ReactNode;
  label: string;
  /** The control's id, so the label and message point at it; defaults to the label text. */
  id?: string;
  error?: string | undefined;
  /** Shown under the field; replaced by the error while there is one. */
  hint?: React.ReactNode;
  info?: React.ReactNode;
  className?: string;
}
type InputWithLabelProps = InputProps & Omit<WithLabel, 'children'>;

/** Spaces would split an aria-describedby reference, so the id is made of one token. */
export function fieldMessageId(fieldId: string) {
  return `${fieldId.replace(/\s+/g, '-')}-message`;
}

export const WithLabel = ({
  children,
  className,
  label,
  id,
  hint,
  info,
  error,
}: WithLabel) => {
  const message = error ?? hint;
  const fieldId = id ?? label;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="mb-0 flex items-center gap-1" htmlFor={fieldId}>
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
          id={fieldMessageId(fieldId)}
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
    const generatedId = useId();
    // A caller's own id and description are kept; the message is added to them.
    const fieldId = inputProps.id ?? generatedId;
    const describedBy =
      [inputProps['aria-describedby'], hasMessage && fieldMessageId(fieldId)]
        .filter(Boolean)
        .join(' ') || undefined;
    return (
      <WithLabel
        className={className}
        error={error}
        hint={hint}
        id={fieldId}
        info={info}
        label={label}
      >
        <Input
          error={error}
          ref={ref}
          {...inputProps}
          aria-describedby={describedBy}
          id={fieldId}
        />
      </WithLabel>
    );
  }
);

InputWithLabel.displayName = 'InputWithLabel';
