import { MixanResponse } from "@mixan/types";

export function success<T>(result?: T): MixanResponse<T | null> {
  return {
    result: result || null,
    status: 'ok'
  }
}