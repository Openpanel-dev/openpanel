import { NextFunction, Response, Router } from 'express'
import { db } from '../db'
import { MixanRequest } from '../types/express'
import { getProfile, tickProfileProperty } from '../services/profile'
import {
  ProfileDecrementPayload,
  ProfileIncrementPayload,
  ProfilePayload,
} from '@mixan/types'
import { success } from '../responses/success'
import randomAnimalName from 'random-animal-name'

const router = Router()

type PostRequest = MixanRequest<ProfilePayload>

router.get('/profiles', async (req, res, next) => {
  try {
    res.json(
      success(
        await db.profile.findMany({
          where: {
            project_id: req.client.project_id,
          },
        })
      )
    )
  } catch (error) {
    next(error)
  }
})

router.post(
  '/profiles',
  async (
    req: MixanRequest<{
      id: string
      properties?: Record<string, any>
    }>,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const projectId = req.client.project_id
      const { id, properties } = req.body
      const profile = await db.profile.create({
        data: {
          id,
          external_id: null,
          email: null,
          first_name: randomAnimalName(),
          last_name: null,
          avatar: null,
          properties: {
            ...(properties || {}),
          },
          project_id: projectId,
        },
      })

      res.status(201).json(success(profile))
    } catch (error) {
      next(error)
    }
  }
)

router.put('/profiles/:id', async (req: PostRequest, res: Response, next: NextFunction) => {
  try {
    const profileId = req.params.id
    const profile = await getProfile(profileId)
    const { body } = req
    if (profile) {
      await db.profile.update({
        where: {
          id: profileId,
        },
        data: {
          external_id: body.id,
          email: body.email,
          first_name: body.first_name,
          last_name: body.last_name,
          avatar: body.avatar,
          properties: {
            ...(typeof profile.properties === 'object'
              ? profile.properties || {}
              : {}),
            ...(body.properties || {}),
          },
        },
      })

      res.status(200).json(success())
    }
  } catch (error) {
    next(error)
  }
})

router.put(
  '/profiles/:id/increment',
  async (req: MixanRequest<ProfileIncrementPayload>, res: Response, next: NextFunction) => {
    try {
      await tickProfileProperty({
        name: req.body.name,
        tick: req.body.value,
        profileId: req.params.id,
      })
      res.status(200).json(success())
    } catch (error) {
      next(error)
    }
  }
)

router.put(
  '/profiles/:id/decrement',
  async (req: MixanRequest<ProfileDecrementPayload>, res: Response, next: NextFunction) => {
    try {
      await tickProfileProperty({
        name: req.body.name,
        tick: -Math.abs(req.body.value),
        profileId: req.params.id,
      })
      res.status(200).json(success())
    } catch (error) {
      next(error)
    }
  }
)

export default router
