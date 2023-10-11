import {
  MixanIssue,
  MixanErrorResponse,
  MixanIssuesResponse,
} from '@mixan/types'

export function issues(arr: Array<MixanIssue>): MixanIssuesResponse {
  return {
    issues: arr.map((item) => {
      return {
        field: item.field,
        message: item.message,
        value: item.value,
      }
    }),
  }
}

export function makeError(error: unknown): MixanErrorResponse {
  if (error instanceof Error) {
    return {
      code: 'Error',
      message: error.message,
    }
  }

  // @ts-ignore
  if ('message' in error) {
    return {
      code: 'UnknownError',
      // @ts-ignore
      message: error.message,
    }
  }

  return {
    code: 'UnknownError',
    message: 'Unknown error',
  }
}
