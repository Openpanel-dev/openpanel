import { motion } from 'framer-motion';

import { AnimatePresence } from 'framer-motion';
import { RefreshCcwIcon } from 'lucide-react';
import { type InputHTMLAttributes, useEffect, useState } from 'react';
import { Badge } from './badge';
import { Input } from './input';

export function InputEnter({
  value,
  onChangeValue,
  ...props
}: {
  value: string | undefined;
  onChangeValue: (value: string) => void;
} & InputHTMLAttributes<HTMLInputElement>) {
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
        value={internalValue}
        onChange={(e) => setInternalValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            onChangeValue(internalValue);
          }
        }}
        size="default"
      />
      <div className="absolute right-2 top-1/2 -translate-y-1/2">
        <AnimatePresence>
          {internalValue !== value && (
            <motion.button
              key="refresh"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => onChangeValue(internalValue)}
            >
              <Badge variant="muted">
                Press enter
                <RefreshCcwIcon className="ml-1 h-3 w-3" />
              </Badge>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
