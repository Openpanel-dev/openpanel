import { toast } from 'sonner';

export function clipboard(value: string | number, description?: null | string) {
  navigator.clipboard.writeText(value.toString());
  toast(
    'Copied to clipboard',
    description !== null
      ? {
          description: description ?? value.toString(),
        }
      : {},
  );
}
