import { NextFunction, Response, Router } from 'express'
import { db } from '../db'
import { MixanRequest } from '../types/express'
import { EventPayload } from '@mixan/types'
import { getEvents } from '../services/event'
import { success } from '../responses/success'
import { getProfile } from '../services/profile'
import { uniq } from 'ramda'
const router = Router()

type PostRequest = MixanRequest<Array<EventPayload>>

router.get('/events', async (req, res, next) => {
  try {
    const events = await getEvents(req.client.project_id)
    res.json(success(events))
  } catch (error) {
    next(error)
  }
})

router.post(
  '/events',
  async (req: PostRequest, res: Response, next: NextFunction) => {
    try {
      const projectId = req.client.project_id

      const profileIds = uniq(
        req.body
          .map((event) => event.profileId)
          .filter((id): id is string => !!id)
      )

      for (const profileId of profileIds) {
        try {
          await getProfile(profileId)
        } catch (error) {
          console.log('Profile not found, create it', profileId)
          await db.profile.create({
            data: {
              project_id: projectId,
              id: profileId,
              properties: {},
            },
          })
        }
      }

      await db.event.createMany({
        data: req.body.map((event) => ({
          name: event.name,
          properties: event.properties,
          createdAt: event.time,
          project_id: projectId,
          profile_id: event.profileId,
        })),
      })

      res.status(201).json(success())
    } catch (error) {
      next(error)
    }
  }
)

export default router
