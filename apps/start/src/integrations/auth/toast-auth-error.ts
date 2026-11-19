import { PASSWORD_RESET_REQUIRED } from '@openpanel/core/modules/auth/auth.constants';
import { toast } from 'sonner';
import { AuthError } from './client';
import { pushModal } from '@/modals';

/** An expired legacy password gets a way out, not just the message. */
export function toastAuthError(error: Error, email?: string): void {
  const resetRequired =
    error instanceof AuthError && error.code === PASSWORD_RESET_REQUIRED;
  if (!resetRequired) {
    toast.error(error.message);
    return;
  }
  toast.error(error.message, {
    action: {
      label: 'Reset password',
      onClick: () => pushModal('RequestPasswordReset', { email }),
    },
  });
}
