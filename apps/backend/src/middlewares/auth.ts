import { NextFunction, Request, Response } from "express"
import { db } from "../db"
import { createError } from "../responses/errors"

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {  
  const secret = req.headers['mixan-client-secret'] as string | undefined

  if(!secret) {
    return next(createError(401, 'Misisng client secret'))
  }

  const client = await db.client.findFirst({
    where: {
      secret,
    },
  })

  if(!client) {
    return next(createError(401, 'Invalid client secret'))
  }
  
  req.client = {
    project_id: client.project_id,
  }
  
  next()
}