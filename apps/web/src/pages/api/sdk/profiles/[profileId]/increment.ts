import { validateSdkRequest } from '@/server/auth';
import { createError, handleError } from '@/server/exceptions';
import { tickProfileProperty } from '@/server/services/profile.service';
import type { NextApiRequest, NextApiResponse } from 'next';

import { type ProfileIncrementPayload } from '@mixan/types';

interface Request extends NextApiRequest {
  body: ProfileIncrementPayload;
}

export default async function handler(req: Request, res: NextApiResponse) {
  if (req.method !== 'PUT') {
    return handleError(res, createError(405, 'Method not allowed'));
  }

  try {
    // Check client id & secret
    await validateSdkRequest(req);

    const profileId = req.query.profileId as string;

    await tickProfileProperty({
      name: req.body.name,
      tick: req.body.value,
      profileId,
    });

    res.status(200).end();
  } catch (error) {
    handleError(res, error);
  }
}
