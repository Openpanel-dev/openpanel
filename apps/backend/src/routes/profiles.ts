import { Router } from 'express'
import { db } from '../db'
import { MixanRequest } from '../types/express'
import {
  createProfile,
  getProfileByExternalId,
  updateProfile,
} from '../services/profile'
import {
  ProfileDecrementPayload,
  ProfileIncrementPayload,
  ProfilePayload,
} from '@mixan/types'
import { issues } from '../responses/errors'
import { success } from '../responses/success'

const router = Router()

type PostRequest = MixanRequest<ProfilePayload>

router.get('/profiles', async (req, res) => {
  res.json(success(await db.profile.findMany({
    where: {
      project_id: req.client.project_id,
    },
  })))
})

router.post('/profiles', async (req: PostRequest, res) => {
  const body = req.body
  const projectId = req.client.project_id
  const profile = await getProfileByExternalId(projectId, body.id)
  if (profile) {
    await updateProfile(projectId, body.id, body, profile)
  } else {
    await createProfile(projectId, body)
  }

  res.status(profile ? 200 : 201).json(success())
})

router.post(
  '/profiles/increment',
  async (req: MixanRequest<ProfileIncrementPayload>, res) => {
    const body = req.body
    const projectId = req.client.project_id
    const profile = await getProfileByExternalId(projectId, body.id)

    if (profile) {
      const existingProperties = (
        typeof profile.properties === 'object' ? profile.properties || {} : {}
      ) as Record<string, number>
      const value =
        body.name in existingProperties ? existingProperties[body.name] : 0
      const properties = {
        ...existingProperties,
        [body.name]: value + body.value,
      }

      if (typeof value !== 'number') {
        return res.status(400).json(
          issues([
            {
              field: 'name',
              message: 'Property is not a number',
              value,
            },
          ])
        )
      }

      await db.profile.updateMany({
        where: {
          external_id: String(body.id),
          project_id: req.client.project_id,
        },
        data: {
          properties,
        },
      })
    }

    res.status(200).json(success())
  }
)

router.post(
  '/profiles/decrement',
  async (req: MixanRequest<ProfileDecrementPayload>, res) => {
    const body = req.body
    const projectId = req.client.project_id
    const profile = await getProfileByExternalId(projectId, body.id)

    if (profile) {
      const existingProperties = (
        typeof profile.properties === 'object' ? profile.properties || {} : {}
      ) as Record<string, number>
      const value =
        body.name in existingProperties ? existingProperties[body.name] : 0

        if (typeof value !== 'number') {
          return res.status(400).json(
            issues([
              {
                field: 'name',
                message: 'Property is not a number',
                value,
              },
            ])
          )
        }

      const properties = {
        ...existingProperties,
        [body.name]: value - body.value,
      }

      await db.profile.updateMany({
        where: {
          external_id: String(body.id),
          project_id: req.client.project_id,
        },
        data: {
          properties,
        },
      })
    }

    res.status(200).json(success())
  }
)

export default router
