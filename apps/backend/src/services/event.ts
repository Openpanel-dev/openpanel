import { db } from "../db";

export function getEvents(projectId: string) {
  return db.event.findMany({
    where: {
      project_id: projectId,
    }
  })
}
