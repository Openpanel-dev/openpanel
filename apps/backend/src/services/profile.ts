import { EventPayload, ProfilePayload } from "@mixan/types";
import { db } from "../db";
import { Prisma } from "@prisma/client";

export function createProfile(projectId: string, payload: ProfilePayload) {
  const { id, email, first_name, last_name, avatar, properties } = payload
  return db.profile.create({
    data:{
      external_id: id,
      email,
      first_name,
      last_name,
      avatar,
      properties: properties || {},
      project_id: projectId,
    }
  })
}

type DbProfile = Exclude<Prisma.PromiseReturnType<typeof getProfileByExternalId>, null>

export function getProfileByExternalId(projectId: string, externalId: string) {
  return db.profile.findUnique({
    where: {
      project_id_external_id: {
        project_id: projectId,
        external_id: externalId,
      }
    }
  })
}

export function getProfiles(projectId: string) {
  return db.profile.findMany({
    where: {
      project_id: projectId,
    }
  })
}

export async function updateProfile(projectId: string, profileId: string, payload: Omit<ProfilePayload, 'id'>, oldProfile: DbProfile) {
  const { email, first_name, last_name, avatar, properties } = payload
  return db.profile.update({
    where: {
      project_id_external_id: {
        project_id: projectId,
        external_id: profileId,
      }
    },
    data: {
      email,
      first_name,
      last_name,
      avatar,
      properties: {
        ...(typeof oldProfile.properties === 'object' ? oldProfile.properties || {} : {}),
        ...(properties || {}),
      },
    },
  })
}

export async function getInternalProfileId(profileId?: string | null) {
  if(!profileId) {
    return null
  }

  const profile = await db.profile.findFirst({
    where: {
      external_id: profileId,
    }
  })

  return profile?.id || null
}