import type { AppRouter } from '@openpanel/trpc';
import type { TRPCClientErrorBase } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { type ExternalToast, toast } from 'sonner';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export function handleError(error: TRPCClientErrorBase<any>) {
  toast('Error', {
    description: error.message,
  });
}

export function handleErrorToastOptions(options: ExternalToast) {
  return (error: TRPCClientErrorBase<any>) => {
    toast('Error', {
      description: error.message,
      ...options,
    });
  };
}
