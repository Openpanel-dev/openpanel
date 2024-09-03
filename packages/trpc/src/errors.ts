import { TRPCError } from '@trpc/server';

export const TRPCAccessError = (message: string) =>
  new TRPCError({
    code: 'UNAUTHORIZED',
    message,
  });

export const TRPCNotFoundError = (message: string) =>
  new TRPCError({
    code: 'NOT_FOUND',
    message,
  });
