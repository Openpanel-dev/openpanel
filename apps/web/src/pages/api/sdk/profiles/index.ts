import { validateSdkRequest } from '@/server/auth';
import { db } from '@/server/db';
import { createError, handleError } from '@/server/exceptions';
import type { NextApiRequest, NextApiResponse } from 'next';
import randomAnimalName from 'random-animal-name';

import type {
  CreateProfilePayload,
  CreateProfileResponse,
  ProfilePayload,
} from '@mixan/types';

interface Request extends NextApiRequest {
  body: ProfilePayload | CreateProfilePayload;
}

export default async function handler(req: Request, res: NextApiResponse) {
  if (req.method == 'OPTIONS') {
    await validateSdkRequest(req, res);
    return res.status(200).json({});
  }

  if (req.method !== 'POST') {
    return handleError(res, createError(405, 'Method not allowed'));
  }

  try {
    // Check client id & secret
    const projectId = await validateSdkRequest(req, res);

    // Providing an `ID` is deprecated, should be removed in the future
    const profileId = 'id' in req.body ? req.body.id : undefined;
    const { properties } = req.body ?? {};

    const profile = await db.profile.create({
      data: {
        id: profileId,
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

    const response: CreateProfileResponse = { id: profile.id };
    res.status(200).json(response);
  } catch (error) {
    handleError(res, error);
  }
}
