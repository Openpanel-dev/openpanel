import {NextFunction, Response, Router} from 'express'
import { db } from '../db';
import { MixanRequest } from '../types/express';
import { EventPayload } from '@mixan/types';
import { getEvents } from '../services/event';
import { success } from '../responses/success';

const router = Router();

type PostRequest = MixanRequest<Array<EventPayload>>

router.get('/events', async (req, res, next) => {
  try {
    const events = await getEvents(req.client.project_id)
    res.json(success(events))
  } catch (error) {
    next(error)
  }
})

router.post('/events', async (req: PostRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.client.project_id
    
    await db.event.createMany({
      data: req.body.map((event) => ({
        name: event.name,
        properties: event.properties,
        createdAt: event.time,
        project_id: projectId,
        profile_id: event.profileId,
      }))
    })
  
    res.status(201).json(success())
  } catch (error) {
    next(error)
  }
})

export default router