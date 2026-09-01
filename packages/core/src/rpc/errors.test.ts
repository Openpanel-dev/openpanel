import { expect, test } from 'bun:test';
import { TRPCError } from '@trpc/server';
import {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCInternalServerError,
  TRPCNotFoundError,
} from './errors';

// The five classes and their codes are the wire contract apps/start narrows on.
const CASES = [
  [TRPCAccessError, 'UNAUTHORIZED'],
  [TRPCNotFoundError, 'NOT_FOUND'],
  [TRPCForbiddenError, 'FORBIDDEN'],
  [TRPCInternalServerError, 'INTERNAL_SERVER_ERROR'],
  [TRPCBadRequestError, 'BAD_REQUEST'],
] as const;

for (const [Klass, code] of CASES) {
  test(`${Klass.name} carries ${code} and its message`, () => {
    const error = new Klass('nope');

    expect(error).toBeInstanceOf(TRPCError);
    expect(error.code).toBe(code);
    expect(error.message).toBe('nope');
  });
}
