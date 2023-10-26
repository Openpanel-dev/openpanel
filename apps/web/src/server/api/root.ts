import { createTRPCRouter } from "@/server/api/trpc";
import { chartRouter } from "./routers/chart";
import { reportRouter } from "./routers/report";
import { organizationRouter } from "./routers/organization";
import { userRouter } from "./routers/user";
import { projectRouter } from "./routers/project";
import { clientRouter } from "./routers/client";
import { dashboardRouter } from "./routers/dashboard";

/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  chart: chartRouter,
  report: reportRouter,
  dashboard: dashboardRouter,
  organization: organizationRouter,
  user: userRouter,
  project: projectRouter,
  client: clientRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;
