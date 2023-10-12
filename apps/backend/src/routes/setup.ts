import { NextFunction, Request, Response } from 'express'
import { db } from '../db'
import { v4 as uuid } from 'uuid'
import { hashPassword } from '../services/hash'
import { success } from '../responses/success'

export async function setup(req: Request, res: Response, next: NextFunction) {
  try {
    const counts = await db.$transaction([
      db.organization.count(),
      db.project.count(),
      db.client.count(),
    ])    

    if (counts.some((count) => count > 0)) {
      return res.json(success('Setup already done'))
    }

    const organization = await db.organization.create({
      data: {
        name: 'Acme Inc.',
      },
    })

    const project = await db.project.create({
      data: {
        name: 'Acme Website',
        organization_id: organization.id,
      },
    })
    const secret = uuid()
    const client = await db.client.create({
      data: {
        name: 'Acme Website Client',
        project_id: project.id,
        secret: await hashPassword(secret),
      },
    })

    res.json(
      success({
        clientId: client.id,
        clientSecret: secret,
      })
    )
  } catch (error) {
    next(error)
  }
}
