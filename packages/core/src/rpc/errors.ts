import { TRPCError } from '@trpc/server';

export class TRPCAccessError extends TRPCError {
  constructor(message: string) {
    super({ code: 'UNAUTHORIZED', message });
  }
}

export class TRPCNotFoundError extends TRPCError {
  constructor(message: string) {
    super({ code: 'NOT_FOUND', message });
  }
}

export class TRPCForbiddenError extends TRPCError {
  constructor(message: string) {
    super({ code: 'FORBIDDEN', message });
  }
}

export class TRPCInternalServerError extends TRPCError {
  constructor(message: string) {
    super({ code: 'INTERNAL_SERVER_ERROR', message });
  }
}

export class TRPCBadRequestError extends TRPCError {
  constructor(message: string) {
    super({ code: 'BAD_REQUEST', message });
  }
}
