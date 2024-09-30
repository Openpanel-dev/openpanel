'use client';

import { Input } from '@/components/ui/input';
import { useDispatch, useSelector } from '@/redux';

import { Badge } from '@/components/ui/badge';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCcwIcon } from 'lucide-react';
import { type InputHTMLAttributes, useEffect, useState } from 'react';
import { changeFormula } from '../reportSlice';

export function ReportFormula() {
  const formula = useSelector((state) => state.report.formula);
  const dispatch = useDispatch();

  return (
    <div>
      <h3 className="mb-2 font-medium">Formula</h3>
      <div className="flex flex-col gap-4">
        <InputFormula
          placeholder="eg: A/B"
          value={formula ?? ''}
          onChangeValue={(value) => {
            dispatch(changeFormula(value));
          }}
        />
      </div>
    </div>
  );
}

function InputFormula({
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
