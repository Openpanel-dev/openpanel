import { db } from "@/server/db"
import { HttpError } from "@/server/exceptions"

export function getProfile(id: string) {
  return db.profile.findUniqueOrThrow({
    where: {
      id,
    },
  })
}

export async function tickProfileProperty({
  profileId,
  tick,
  name,
}: {
  profileId: string
  tick: number
  name: string
}) {
  const profile = await getProfile(profileId)

  if (!profile) {
    throw new HttpError(404, `Profile not found ${profileId}`)
  }

  const properties = (
    typeof profile.properties === 'object' ? profile.properties || {} : {}
  ) as Record<string, number>
  const value = name in properties ? properties[name] : 0

  if (typeof value !== 'number') {
    throw new HttpError(400, `Property "${name}" on user is of type ${typeof value}`)
  }
  
  if (typeof tick !== 'number') {
    throw new HttpError(400, `Value is not a number ${tick} (${typeof tick})`)
  }

  await db.profile.update({
    where: {
      id: profileId,
    },
    data: {
      properties: {
        ...properties,
        [name]: value + tick,
      },
    },
  })
}