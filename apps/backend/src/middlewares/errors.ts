import { NextFunction, Request, Response } from "express";
import { HttpError } from "../responses/errors";
import { MixanErrorResponse } from "@mixan/types";

export const errorHandler = (error: HttpError | Error, req: Request, res: Response, next: NextFunction) => {
  if(error instanceof HttpError) {
    console.log('[HttpError]', error.toJson())
    return res.status(error.status).json(error.toJson())
  }

  console.log('[UnknownError]', error.name, error.message)
  if(error.stack) {
    console.log(error.stack)
  }
  return res.status(500).json({
    code: 500,
    status: 'error',
    message: error.message || 'Unexpected error occured',
    issues: []
  } satisfies MixanErrorResponse);
};