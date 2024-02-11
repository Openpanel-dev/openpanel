import { parseIp } from '@/utils/parseIp';
import { parseUserAgent } from '@/utils/parseUserAgent';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { assocPath, mergeDeepRight, path } from 'ramda';
import { getClientIp } from 'request-ip';

import { generateProfileId, toDots } from '@mixan/common';
import type { IDBProfile, Profile } from '@mixan/db';
import { db, getSalts } from '@mixan/db';
import type {
  IncrementProfilePayload,
  UpdateProfilePayload,
} from '@mixan/types';

async function findProfile({
  profileId,
  ip,
  origin,
  ua,
}: {
  profileId: string | null;
  ip: string;
  origin: string;
  ua: string;
}) {
  const salts = await getSalts();
  const currentProfileId = generateProfileId({
    salt: salts.current,
    origin,
    ip,
    ua,
  });
  const previousProfileId = generateProfileId({
    salt: salts.previous,
    origin,
    ip,
    ua,
  });

  const ids = [currentProfileId, previousProfileId];
  if (profileId) {
    ids.push(profileId);
  }

  const profiles = await db.profile.findMany({
    where: {
      id: {
        in: ids,
      },
    },
  });

  return profiles.find((p) => {
    return (
      p.id === profileId ||
      p.id === currentProfileId ||
      p.id === previousProfileId
    );
  }) as IDBProfile | undefined;
}

export async function updateProfile(
  request: FastifyRequest<{
    Body: UpdateProfilePayload;
  }>,
  reply: FastifyReply
) {
  const body = request.body;
  const profileId: string | null = body.profileId ?? null;
  const projectId = request.projectId;
  const ip = getClientIp(request)!;
  const origin = request.headers.origin ?? projectId;
  const ua = request.headers['user-agent']!;
  const salts = await getSalts();
  const uaInfo = parseUserAgent(ua);
  const geo = await parseIp(ip);

  if (profileId === null) {
    const currentProfileId = generateProfileId({
      salt: salts.current,
      origin,
      ip,
      ua,
    });
    const previousProfileId = generateProfileId({
      salt: salts.previous,
      origin,
      ip,
      ua,
    });

    const profiles = await db.profile.findMany({
      where: {
        id: {
          in: [currentProfileId, previousProfileId],
        },
      },
    });

    if (profiles.length === 0) {
      const profile = await db.profile.create({
        data: {
          id: currentProfileId,
          external_id: body.id,
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email,
          avatar: body.avatar,
          project_id: projectId,
          properties: body.properties ?? {},
          // ...uaInfo,
          // ...geo,
        },
      });

      return reply.status(201).send(profile);
    }
    const currentProfile = profiles.find((p) => p.id === currentProfileId);
    const previousProfile = profiles.find((p) => p.id === previousProfileId);
    const profile = currentProfile ?? previousProfile;

    if (profile) {
      await db.profile.update({
        where: {
          id: profile.id,
        },
        data: {
          external_id: body.id,
          first_name: body.first_name,
          last_name: body.last_name,
          email: body.email,
          avatar: body.avatar,
          properties: toDots(
            mergeDeepRight(
              profile.properties as Record<string, unknown>,
              body.properties ?? {}
            )
          ),
          // ...uaInfo,
          // ...geo,
        },
      });

      return reply.status(200).send(profile.id);
    }

    return reply.status(200).send();
  }

  const profile = await db.profile.findUnique({
    where: {
      id: profileId,
    },
  });

  if (profile) {
    await db.profile.update({
      where: {
        id: profile.id,
      },
      data: {
        external_id: body.id,
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        avatar: body.avatar,
        properties: toDots(
          mergeDeepRight(
            profile.properties as Record<string, unknown>,
            body.properties ?? {}
          )
        ),
        // ...uaInfo,
        // ...geo,
      },
    });
  } else {
    await db.profile.create({
      data: {
        id: profileId,
        external_id: body.id,
        first_name: body.first_name,
        last_name: body.last_name,
        email: body.email,
        avatar: body.avatar,
        project_id: projectId,
        properties: body.properties ?? {},
        // ...uaInfo,
        // ...geo,
      },
    });
  }

  reply.status(202).send(profileId);
}

export async function incrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const body = request.body;
  const profileId: string | null = body.profileId ?? null;
  const projectId = request.projectId;
  const ip = getClientIp(request)!;
  const origin = request.headers.origin ?? projectId;
  const ua = request.headers['user-agent']!;

  const profile = await findProfile({
    ip,
    origin,
    ua,
    profileId,
  });

  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const property = path(body.property.split('.'), profile.properties);

  if (typeof property !== 'number' && typeof property !== 'undefined') {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    body.property.split('.'),
    property ? property + body.value : body.value,
    profile.properties
  );

  await db.profile.update({
    where: {
      id: profile.id,
    },
    data: {
      properties: profile.properties as any,
    },
  });

  reply.status(202).send(profile.id);
}

export async function decrementProfileProperty(
  request: FastifyRequest<{
    Body: IncrementProfilePayload;
  }>,
  reply: FastifyReply
) {
  const body = request.body;
  const profileId: string | null = body.profileId ?? null;
  const projectId = request.projectId;
  const ip = getClientIp(request)!;
  const origin = request.headers.origin ?? projectId;
  const ua = request.headers['user-agent']!;

  const profile = await findProfile({
    ip,
    origin,
    ua,
    profileId,
  });

  if (!profile) {
    return reply.status(404).send('Not found');
  }

  const property = path(body.property.split('.'), profile.properties);

  if (typeof property !== 'number') {
    return reply.status(400).send('Not number');
  }

  profile.properties = assocPath(
    body.property.split('.'),
    property ? property - body.value : -body.value,
    profile.properties
  );

  await db.profile.update({
    where: {
      id: profile.id,
    },
    data: {
      properties: profile.properties as any,
    },
  });

  reply.status(202).send(profile.id);
}
