import type { NextApiResponse } from 'next';

import type { MixanErrorResponse, MixanIssue } from '@mixan/types';

export class HttpError extends Error {
  public status: number;
  public message: string;
  public issues: MixanIssue[];

  constructor(status: number, message: string | Error, issues?: MixanIssue[]) {
    super(message instanceof Error ? message.message : message);
    this.status = status;
    this.message = message instanceof Error ? message.message : message;
    this.issues = issues ?? [];
  }

  toJson(): MixanErrorResponse {
    return {
      code: this.status,
      status: 'error',
      message: this.message,
      issues: this.issues.length ? this.issues : undefined,
      stack: process.env.NODE_ENV !== 'production' ? this.stack : undefined,
    };
  }
}

export function createIssues(arr: MixanIssue[]) {
  throw new HttpError(400, 'Issues', arr);
}

export function createError(status = 500, error: unknown) {
  if (error instanceof Error || typeof error === 'string') {
    return new HttpError(status, error);
  }

  return new HttpError(500, 'Unexpected error occured');
}

export function handleError(res: NextApiResponse, error: unknown) {
  console.log('-----------------');
  console.log('ERROR');
  console.log(error);
  console.log('-----------------');

  if (error instanceof HttpError) {
    return res.status(error.status).json(error.toJson());
  }

  if (error instanceof Error) {
    const httpError = createError(500, error);
    return res.status(httpError.status).json(httpError.toJson());
  }

  const httpError = createError(500, error);
  return res.status(httpError.status).json(httpError.toJson());
}
