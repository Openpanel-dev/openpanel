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

export default function handler(req: Request, res: NextApiResponse) {
  eventsQueue.add('batch', {
    payload: [
      {
        type: 'event',
        payload: {
          profileId: 'f8235c6a-c720-4f38-8f6c-b6b7d31e16db',
          name: 'test',
          properties: {},
          time: new Date().toISOString(),
        },
      },
    ],
    projectId: 'b725eadb-a1fe-4be8-bf0b-9d9bfa6aac12',
  });
  res.status(200).json({ status: 'ok' });
}
