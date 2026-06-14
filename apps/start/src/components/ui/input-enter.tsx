import { useEffect, useState } from 'react';
import { Input, type InputProps } from './input';

export function InputEnter({
  value,
  onChangeValue,
  ...props
}: {
  value: string | undefined;
  onChangeValue: (value: string) => void;
} & InputProps) {
  const [internalValue, setInternalValue] = useState(value ?? '');

  useEffect(() => {
    if (value !== internalValue) {
      setInternalValue(value ?? '');
    }
  }, [value]);

  return (
    <div className="w-full">
      <Input
        {...props}
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChangeValue(internalValue);
          }
        }}
        onBlur={() => {
          if (internalValue !== value) {
            onChangeValue(internalValue);
          }
        }}
      />
    </div>
  );
}
