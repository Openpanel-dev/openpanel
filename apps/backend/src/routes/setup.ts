import { Request, Response } from 'express'
import { db } from '../db'
import { makeError } from '../responses/errors'
import { v4 as uuid } from 'uuid'

export async function setup(req: Request, res: Response) {
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
        secret: uuid(),
      },
    })

    res.json({
      organization,
      project,
      client,
    })
  } catch (error) {
    res.json(makeError(error))
  }
}
