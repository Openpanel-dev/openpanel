import { validateSdkRequest } from '@/server/auth';
import { createError, handleError } from '@/server/exceptions';
import type { NextApiRequest, NextApiResponse } from 'next';

import { eventsQueue } from '@mixan/queue';
import type { BatchPayload } from '@mixan/types';

interface Request extends NextApiRequest {
  body: BatchPayload[];
}

export const config = {
  api: {
    responseLimit: false,
  },
};

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

    await eventsQueue.add('batch', {
      projectId,
      payload: req.body,
    });

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    handleError(res, error);
  }
}
