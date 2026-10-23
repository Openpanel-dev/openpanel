import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { forwardRef, useId, useState } from 'react';
import { fieldMessageId, WithLabel } from '../forms/input-with-label';
import { Input, type InputProps } from '../ui/input';

type Props = Omit<InputProps, 'type'> & {
  label: string;
  error?: string | undefined;
  hint?: React.ReactNode;
  /** Rendered at the right end of the label row, e.g. a "Forgot password?" link. */
  action?: React.ReactNode;
};

export const PasswordInput = forwardRef<HTMLInputElement, Props>(
  ({ label, error, hint, action, className, size, ...inputProps }, ref) => {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const fieldId = inputProps.id ?? generatedId;
    const hasMessage = Boolean(error ?? hint);
    return (
      <WithLabel
        action={action}
        className={className}
        error={error}
        hint={hint}
        id={fieldId}
        label={label}
      >
        <div className="relative">
          <Input
            error={error}
            ref={ref}
            size={size}
            {...inputProps}
            aria-describedby={hasMessage ? fieldMessageId(fieldId) : undefined}
            autoComplete={inputProps.autoComplete ?? 'current-password'}
            className="pr-11"
            id={fieldId}
            type={visible ? 'text' : 'password'}
          />
          <button
            aria-label={visible ? 'Hide password' : 'Show password'}
            aria-pressed={visible}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setVisible((current) => !current)}
            type="button"
          >
            {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
          </button>
        </div>
      </WithLabel>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';
