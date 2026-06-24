import { toast } from 'sonner';

function copyWithTextarea(value: string) {
  if (typeof document === 'undefined' || !document.execCommand) {
    return false;
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.top = '-9999px';
  textarea.style.left = '-9999px';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export async function clipboard(
  value: string | number,
  description?: null | string
) {
  const text = value.toString();
  const clipboardApi =
    typeof navigator === 'undefined' ? undefined : navigator.clipboard;
  let copied = false;

  if (clipboardApi?.writeText) {
    try {
      await clipboardApi.writeText(text);
      copied = true;
    } catch {
      copied = false;
    }
  }

  if (!copied) {
    copied = copyWithTextarea(text);
  }

  if (!copied) {
    toast.error('Failed to copy to clipboard', {
      description: 'Please copy it manually.',
    });
    return;
  }

  toast(
    'Copied to clipboard',
    description !== null
      ? {
          description: description ?? text,
        }
      : {}
  );
}
