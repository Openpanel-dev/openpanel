import { TRPCError } from '@trpc/server';

export const TRPCAccessError = (message: string) =>
  new TRPCError({
    code: 'UNAUTHORIZED',
    message,
  });
