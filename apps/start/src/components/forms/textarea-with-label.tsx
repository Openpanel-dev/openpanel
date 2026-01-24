import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { forwardRef } from 'react';

interface TextareaWithLabelProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export const TextareaWithLabel = forwardRef<
  HTMLTextAreaElement,
  TextareaWithLabelProps
>(({ label, id, ...props }, ref) => {
  const inputId = id || label.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>{label}</Label>
      <Textarea id={inputId} ref={ref} {...props} />
    </div>
  );
});

TextareaWithLabel.displayName = 'TextareaWithLabel';
