import { validateSdkRequest } from '@/server/auth';
import { db } from '@/server/db';
import { createError, handleError } from '@/server/exceptions';
import type { NextApiRequest, NextApiResponse } from 'next';
import randomAnimalName from 'random-animal-name';

interface Request extends NextApiRequest {
  body: {
    id?: string;
    properties?: Record<string, any>;
  };
}

export default async function handler(req: Request, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return handleError(res, createError(405, 'Method not allowed'));
  }

  try {
    // Check client id & secret
    const projectId = await validateSdkRequest(req);

    const { id, properties } = req.body ?? {};
    const profile = await db.profile.create({
      data: {
        id,
        external_id: null,
        email: null,
        first_name: randomAnimalName(),
        last_name: null,
        avatar: null,
        properties: {
          ...(properties ?? {}),
        },
        project_id: projectId,
      },
    });

    res.status(200).json({ id: profile.id });
  } catch (error) {
    handleError(res, error);
  }
}
