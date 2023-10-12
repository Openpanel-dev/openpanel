import { NextFunction, Request, Response } from 'express'
import { db } from '../db'
import { v4 as uuid } from 'uuid'

export async function setup(req: Request, res: Response, next: NextFunction) {
  try {
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

    const client = await db.client.create({
      data: {
        name: 'Acme Website Client',
        project_id: project.id,
        secret: '4bfc4a0b-37e0-4916-b634-95c6a32a2e77',
      },
    })

    res.json({
      organization,
      project,
      client,
    })
  } catch (error) {
    next(error)
  }
}
