import { toast } from 'sonner';

export function clipboard(value: string | number) {
  navigator.clipboard.writeText(value.toString());
  toast('Copied to clipboard', {
    description: value.toString(),
  });
}
