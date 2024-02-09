import { toast } from 'sonner';

export function clipboard(value: string | number) {
  navigator.clipboard.writeText(value.toString());
  toast({
    title: 'Copied to clipboard',
    description: value.toString(),
  });
}
