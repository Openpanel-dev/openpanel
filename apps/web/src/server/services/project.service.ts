import { db } from "../db";

export function getProjectBySlug(slug: string) {
  return db.project.findUniqueOrThrow({
    where: {
      slug
    },
  });  
}