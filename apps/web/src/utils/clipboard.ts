import { toast } from '@/components/ui/use-toast';

export function clipboard(value: string | number) {
  navigator.clipboard.writeText(value.toString());
  toast({
    title: 'Copied to clipboard',
    description: value.toString(),
  });
}
