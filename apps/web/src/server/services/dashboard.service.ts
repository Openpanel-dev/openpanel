import { db } from "../db";

export function getDashboardBySlug(slug: string) {
  return db.dashboard.findUniqueOrThrow({
    where: {
      slug
    },
  });  
}