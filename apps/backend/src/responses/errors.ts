import {
  MixanIssue,
  MixanErrorResponse
} from '@mixan/types'

export class HttpError extends Error {
  public status: number
  public message: string
  public issues: MixanIssue[]

  constructor(status: number, message: string | Error, issues?: MixanIssue[]) {
    super(message instanceof Error ? message.message : message)
    this.status = status
    this.message = message instanceof Error ? message.message : message
    this.issues = issues || []
  }

  toJson(): MixanErrorResponse  {
    return {
      code: this.status,
      status: 'error',
      message: this.message,
      issues: this.issues,
    }
  }
}

export function createIssues(arr: Array<MixanIssue>) {
  throw new HttpError(400, 'Issues', arr)
}

export function createError(status = 500, error: unknown | Error | string) {
  if(error instanceof Error || typeof error === 'string') {
    return new HttpError(status, error)
  } 

  return new HttpError(500, 'Unexpected error occured')
}
