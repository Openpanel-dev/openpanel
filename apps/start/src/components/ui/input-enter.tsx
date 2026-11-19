import { AnimatePresence, motion } from 'framer-motion';
import { CornerDownLeftIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from './badge';
import { Input, type InputProps } from './input';

export function InputEnter({
  value,
  onChangeValue,
  immediate,
  ...props
}: {
  value: string | undefined;
  onChangeValue: (value: string) => void;
  immediate?: boolean;
} & InputProps) {
  const [internalValue, setInternalValue] = useState(value ?? '');

  useEffect(() => {
    if (value !== internalValue) {
      setInternalValue(value ?? '');
    }
  }, [value]);

  return (
    <div className="relative w-full">
      <Input
        {...props}
        onChange={(e) => {
          setInternalValue(e.target.value);
          if (immediate) {
            onChangeValue(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onChangeValue(internalValue);
          }
        }}
        value={internalValue}
      />
      <div className="absolute top-1/2 right-2 -translate-y-1/2">
        <AnimatePresence>
          {!immediate && internalValue !== value && (
            <motion.button
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              initial={{ opacity: 0, scale: 0.8 }}
              key="refresh"
              onClick={() => onChangeValue(internalValue)}
              type="button"
            >
              <Badge className="gap-1 px-1.5 py-0 text-xs" variant="secondary">
                Press
                <CornerDownLeftIcon className="h-3 w-3" />
              </Badge>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
