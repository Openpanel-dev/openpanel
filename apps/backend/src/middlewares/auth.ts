import { NextFunction, Request, Response } from "express"
import { db } from "../db"
import { verifyPassword } from "../services/password"

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {  
  const secret = req.headers['mixan-client-secret'] as string | undefined

  if(!secret) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Missing client secret',
    })
  }

  const client = await db.client.findFirst({
    where: {
      secret,
    },
  })

  if(!client) {
    return res.status(401).json({
      code: 'UNAUTHORIZED',
      message: 'Invalid client secret',
    })
  }
  
  req.client = {
    project_id: client.project_id,
  }
  
  next()
}