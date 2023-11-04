import { validateSdkRequest } from '@/server/auth';
import { db } from '@/server/db';
import { createError, handleError } from '@/server/exceptions';
import type { NextApiRequest, NextApiResponse } from 'next';

import type { EventPayload } from '@mixan/types';

interface Request extends NextApiRequest {
  body: EventPayload[];
}

export default async function handler(req: Request, res: NextApiResponse) {
  if (req.method == 'OPTIONS') {
    return res.status(202).json({});
  }

  if (req.method !== 'POST') {
    return handleError(res, createError(405, 'Method not allowed'));
  }

  try {
    // Check client id & secret
    const projectId = await validateSdkRequest(req);

    await db.event.createMany({
      data: req.body.map((event) => ({
        name: event.name,
        properties: event.properties,
        createdAt: event.time,
        project_id: projectId,
        profile_id: event.profileId,
      })),
    });

    res.status(200).end();
  } catch (error) {
    handleError(res, error);
  }
}
