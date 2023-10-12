import { NextFunction, Request, Response } from 'express'
import { db } from '../db'
import { HttpError, createError } from '../responses/errors'
import { verifyPassword } from '../services/hash'

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const clientId = req.headers['mixan-client-id'] as string | undefined
    const clientSecret = req.headers['mixan-client-secret'] as string | undefined
  
    if (!clientId) {
      return next(createError(401, 'Misisng client id'))
    }

    if (!clientSecret) {
      return next(createError(401, 'Misisng client secret'))
    }
    
    const client = await db.client.findUnique({
      where: {
        id: clientId,
      },
    })
  
    if(!client) {
      return next(createError(401, 'Invalid client id'))
    }
  
    if (!await verifyPassword(clientSecret, client.secret)) {
      return next(createError(401, 'Invalid client secret'))
    }
  
    req.client = {
      project_id: client.project_id,
    }
  
    next()
  } catch (error) {
    next(new HttpError(500, 'Failed verify client credentials'))
  }
}
