// The assistant's write path is the same tRPC procedures the dashboard calls,
// so access rules and side effects live in one place.
import type { HttpCtx } from '../../../context';
import { createTRPCRouter, makeTrpcContext } from '../../../rpc/base';
import { clientRouter } from '../../client/client.rpc';
import { dashboardRouter } from '../../dashboard/dashboard.rpc';
import { organizationRouter } from '../../organization/organization.rpc';
import { projectRouter } from '../../project/project.rpc';
import { referenceRouter } from '../../reference/reference.rpc';
import { reportRouter } from '../../report/report.rpc';
import { subscriptionRouter } from '../../subscription/subscription.rpc';

const chatActionsRouter = createTRPCRouter({
  client: clientRouter,
  dashboard: dashboardRouter,
  organization: organizationRouter,
  project: projectRouter,
  reference: referenceRouter,
  report: reportRouter,
  subscription: subscriptionRouter,
});

export type ChatActions = ReturnType<typeof chatActionsRouter.createCaller>;

export async function createChatActions(
  httpCtx: HttpCtx
): Promise<ChatActions> {
  const trpcCtx = await makeTrpcContext(httpCtx, new Headers(), {
    cookieOptions: {},
    demoMode: Boolean(httpCtx.config.demoUserId),
  });
  return chatActionsRouter.createCaller(trpcCtx);
}
