// Based on Christin Alares tag input component (https://github.com/christianalares/seventy-seven)

import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { useAnimate } from 'framer-motion';
import { XIcon } from 'lucide-react';
import type { ElementRef } from 'react';
import { useEffect, useRef, useState } from 'react';

type Props = {
  placeholder: string;
  value: string[];
  error?: string;
  className?: string;
  onChange: (value: string[]) => void;
  renderTag?: (tag: string) => string;
  id?: string;
};

const TagInput = ({
  value: propValue,
  onChange,
  renderTag,
  placeholder,
  error,
  id,
}: Props) => {
  const value = (
    Array.isArray(propValue) ? propValue : propValue ? [propValue] : []
  ).filter(Boolean);

  const [isMarkedForDeletion, setIsMarkedForDeletion] = useState(false);
  const inputRef = useRef<ElementRef<'input'>>(null);
  const [inputValue, setInputValue] = useState('');

  const [scope, animate] = useAnimate();

  const appendTag = (tag: string) => {
    onChange([...value, tag.trim()]);
  };

  const removeTag = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();

      const tagAlreadyExists = value.some(
        (tag) => tag.toLowerCase() === inputValue.toLowerCase(),
      );

      if (inputValue) {
        if (tagAlreadyExists) {
          animate(
            `span[data-tag="${inputValue.toLowerCase()}"]`,
            {
              scale: [1, 1.3, 1],
            },
            {
              duration: 0.3,
            },
          );
          return;
        }

        appendTag(inputValue);
        setInputValue('');
      }
    }

    if (e.key === 'Backspace' && inputValue === '') {
      if (!isMarkedForDeletion) {
        setIsMarkedForDeletion(true);
        return;
      }
      const last = value[value.length - 1];
      if (last) {
        removeTag(last);
      }
      setIsMarkedForDeletion(false);
      setInputValue('');
    }
  };

  const handleBlur = () => {
    if (inputValue) {
      appendTag(inputValue);
      setInputValue('');
    }
  };

  useEffect(() => {
    if (inputValue.length > 0) {
      setIsMarkedForDeletion(false);
    }
  }, [inputValue]);

  return (
    <div
      ref={scope}
      className={cn(
        'inline-flex w-full flex-wrap items-center gap-2 rounded-md border border-input p-1 px-3 ring-offset-background has-[input:focus]:ring-2 has-[input:focus]:ring-ring has-[input:focus]:ring-offset-1',
        !!error && 'border-destructive',
      )}
    >
      {value.map((tag, i) => {
        const isCreating = false;

        return (
          <span
            data-tag={tag}
            key={tag}
            className={cn(
              'inline-flex items-center gap-2 rounded bg-def-200 px-2 py-1 ',
              isMarkedForDeletion &&
                i === value.length - 1 &&
                'bg-destructive-foreground ring-2 ring-destructive/50 ring-offset-1',
              isCreating && 'opacity-60',
            )}
          >
            {renderTag ? renderTag(tag) : tag}
            <Button
              size="icon"
              variant="outline"
              className="h-4 w-4 rounded-full"
              onClick={() => removeTag(tag)}
            >
              <span className="sr-only">Remove tag</span>
              <XIcon name="close" className="size-3" />
            </Button>
          </span>
        );
      })}

      <input
        ref={inputRef}
        placeholder={`${placeholder} ↵`}
        className="min-w-20 flex-1 py-1  focus-visible:outline-none bg-card"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        id={id}
      />
    </div>
  );
};

export default TagInput;
