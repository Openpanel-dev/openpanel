import {Router} from 'express'
import { db } from '../db';
import { MixanRequest } from '../types/express';
import { EventPayload } from '@mixan/types';
import { getEvents, getProfileIdFromEvents } from '../services/event';
import { success } from '../responses/success';
import { makeError } from '../responses/errors';

const router = Router();

type PostRequest = MixanRequest<Array<EventPayload>>

router.get('/events', async (req, res) => {
  try {
    const events = await getEvents(req.client.project_id)
    res.json(success(events))
  } catch (error) {
    res.json(makeError(error))
  }
})

router.post('/events', async (req: PostRequest, res) => {
  const projectId = req.client.project_id
  const profileId = await getProfileIdFromEvents(projectId, req.body) 
  
  await db.event.createMany({
    data: req.body.map(event => ({
      name: event.name,
      properties: event.properties,
      createdAt: event.time,
      project_id: projectId,
      profile_id: profileId,
    }))
  })

  res.status(201).json(success())
})

export default router