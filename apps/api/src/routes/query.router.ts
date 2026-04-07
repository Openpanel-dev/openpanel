import * as controller from '@/controllers/query.controller';
import { validateExportRequest } from '@/utils/auth';
import { activateRateLimiter } from '@/utils/rate-limiter';
import { Prisma } from '@openpanel/db';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

const queryRouter: FastifyPluginCallback = async (fastify) => {
  await activateRateLimiter({
    fastify,
    max: 60,
    timeWindow: '10 seconds',
  });

  fastify.addHook('preHandler', async (req: FastifyRequest, reply) => {
    try {
      const client = await validateExportRequest(req.headers);
      req.client = client;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Client ID seems to be malformed',
        });
      }
      if (e instanceof Error) {
        return reply.status(401).send({ error: 'Unauthorized', message: e.message });
      }
      return reply.status(401).send({ error: 'Unauthorized', message: 'Unexpected error' });
    }
  });

  // Projects
  fastify.get('/projects', controller.listProjects);

  // Analytics
  fastify.get('/:projectId/overview', controller.getOverview);
  fastify.get('/:projectId/active-users', controller.getActiveUsers);
  fastify.get('/:projectId/retention', controller.getRetentionSeries);
  fastify.get('/:projectId/retention/cohort', controller.getRetentionCohort);
  fastify.get('/:projectId/pages/top', controller.getTopPages);
  fastify.get('/:projectId/pages/entry-exit', controller.getEntryExitPages);
  fastify.get('/:projectId/pages/performance', controller.getPagePerformance);
  fastify.get('/:projectId/funnel', controller.getFunnel);
  fastify.get('/:projectId/traffic/referrers', controller.getTrafficReferrers);
  fastify.get('/:projectId/traffic/geo', controller.getTrafficGeo);
  fastify.get('/:projectId/traffic/devices', controller.getTrafficDevices);
  fastify.get('/:projectId/user-flow', controller.getUserFlow);
  fastify.get('/:projectId/engagement', controller.getEngagement);

  // Events
  fastify.get('/:projectId/events', controller.queryEvents);
  fastify.get('/:projectId/events/names', controller.listEventNames);
  fastify.get('/:projectId/events/properties', controller.listEventProperties);
  fastify.get('/:projectId/events/property-values', controller.getEventPropertyValues);

  // Profiles
  fastify.get('/:projectId/profiles', controller.findProfiles);
  fastify.get('/:projectId/profiles/:profileId', controller.getProfile);
  fastify.get('/:projectId/profiles/:profileId/sessions', controller.getProfileSessions);
  fastify.get('/:projectId/profiles/:profileId/metrics', controller.getProfileMetrics);

  // Sessions
  fastify.get('/:projectId/sessions', controller.querySessions);

  // Groups
  fastify.get('/:projectId/groups/types', controller.listGroupTypes);
  fastify.get('/:projectId/groups', controller.findGroups);
  fastify.get('/:projectId/groups/:groupId', controller.getGroup);

  // Dashboards & reports
  fastify.get('/:projectId/dashboards', controller.listDashboards);
  fastify.get('/:projectId/dashboards/:dashboardId/reports', controller.listReports);
  fastify.get('/:projectId/reports/:reportId/data', controller.getReportData);

  // Google Search Console
  fastify.get('/:projectId/gsc/overview', controller.gscOverview);
  fastify.get('/:projectId/gsc/pages', controller.gscPages);
  fastify.get('/:projectId/gsc/pages/details', controller.gscPageDetails);
  fastify.get('/:projectId/gsc/queries', controller.gscQueries);
  fastify.get('/:projectId/gsc/queries/details', controller.gscQueryDetails);
  fastify.get('/:projectId/gsc/queries/opportunities', controller.gscQueryOpportunities);
  fastify.get('/:projectId/gsc/cannibalization', controller.gscCannibalization);
};

export default queryRouter;
