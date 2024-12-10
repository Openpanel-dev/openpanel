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

export const TRPCInternalServerError = (message: string) =>
  new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message,
  });

export const TRPCBadRequestError = (message: string) =>
  new TRPCError({
    code: 'BAD_REQUEST',
    message,
  });
