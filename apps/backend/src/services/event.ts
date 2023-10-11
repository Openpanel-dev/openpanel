import { EventPayload } from "@mixan/types";
import { db } from "../db";

export function getEvents(projectId: string) {
  return db.event.findMany({
    where: {
      project_id: projectId,
    }
  })
}

export async function getProfileIdFromEvents(projectId: string, events: EventPayload[]) {
  const event = events.find(item => !!item.externalId)
  if(event?.externalId) {
    return db.profile.findUnique({
      where: {
        project_id_external_id: {
          project_id: projectId,
          external_id: event.externalId,
        }
      }
    }).then((res) => {
      return res?.id || null
    }).catch(() => {
      return null
    })
  }
  return null
}
