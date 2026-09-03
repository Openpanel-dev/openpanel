// One definition, in @openpanel/core (`rpc/errors`). Re-exported here so V1's
// routers keep their specifier until they move into core's modules (P5-P8).

export {
  TRPCAccessError,
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCInternalServerError,
  TRPCNotFoundError,
} from '@openpanel/core';
