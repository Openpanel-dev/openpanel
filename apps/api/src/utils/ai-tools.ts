import { chartTypes } from '@openpanel/constants';
import type { IClickhouseSession } from '@openpanel/db';
import {
  type IClickhouseEvent,
  type IClickhouseProfile,
  TABLE_NAMES,
  ch,
  clix,
} from '@openpanel/db';
import { getCache } from '@openpanel/redis';
import { getChart } from '@openpanel/trpc/src/routers/chart.helpers';
import { zChartInputAI } from '@openpanel/validation';
import { tool } from 'ai';
import { z } from 'zod';

export function getReport({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: `Generate a report (a chart) for 
    - ${chartTypes.area}
    - ${chartTypes.linear}
    - ${chartTypes.pie}
    - ${chartTypes.histogram}
    - ${chartTypes.metric}
    - ${chartTypes.bar}
`,
    parameters: zChartInputAI,
    execute: async (report) => {
      return {
        type: 'report',
        report: {
          ...report,
          projectId,
        },
      };
      //     try {
      //       const data = await getChart({
      //         ...report,
      //         projectId,
      //       });

      //       return {
      //         type: 'report',
      //         data: `Avg: ${data.metrics.average}, Min: ${data.metrics.min}, Max: ${data.metrics.max}, Sum: ${data.metrics.sum}
      // X-Axis: ${data.series[0]?.data.map((i) => i.date).join(',')}
      // Series:
      // ${data.series
      //   .slice(0, 5)
      //   .map((item) => {
      //     return `- ${item.names.join(' ')} | Sum: ${item.metrics.sum} | Avg: ${item.metrics.average} | Min: ${item.metrics.min} | Max: ${item.metrics.max} | Data: ${item.data.map((i) => i.count).join(',')}`;
      //   })
      //   .join('\n')}
      // `,
      //         report,
      //       };
      //     } catch (error) {
      //       return {
      //         error: 'Failed to generate report',
      //       };
      //     }
    },
  });
}
export function getConversionReport({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description:
      'Generate a report (a chart) for conversions between two actions a unique user took.',
    parameters: zChartInputAI,
    execute: async (report) => {
      return {
        type: 'report',
        // data: await conversionService.getConversion(report),
        report: {
          ...report,
          projectId,
          chartType: 'conversion',
        },
      };
    },
  });
}
export function getFunnelReport({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description:
      'Generate a report (a chart) for funnel between two or more actions a unique user (session_id or profile_id) took.',
    parameters: zChartInputAI,
    execute: async (report) => {
      return {
        type: 'report',
        // data: await funnelService.getFunnel(report),
        report: {
          ...report,
          projectId,
          chartType: 'funnel',
        },
      };
    },
  });
}

export function getProfiles({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: 'Get profiles',
    parameters: z.object({
      projectId: z.string(),
      limit: z.number().optional(),
      email: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      country: z.string().describe('ISO 3166-1 alpha-2').optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      device: z.string().optional(),
      browser: z.string().optional(),
    }),
    execute: async (input) => {
      const builder = clix(ch)
        .select<IClickhouseProfile>([
          'id',
          'email',
          'first_name',
          'last_name',
          'properties',
        ])
        .from(TABLE_NAMES.profiles)
        .where('project_id', '=', projectId);

      if (input.email) {
        builder.where('email', 'LIKE', `%${input.email}%`);
      }

      if (input.firstName) {
        builder.where('first_name', 'LIKE', `%${input.firstName}%`);
      }

      if (input.lastName) {
        builder.where('last_name', 'LIKE', `%${input.lastName}%`);
      }

      if (input.country) {
        builder.where(`properties['country']`, '=', input.country);
      }

      if (input.city) {
        builder.where(`properties['city']`, '=', input.city);
      }

      if (input.region) {
        builder.where(`properties['region']`, '=', input.region);
      }

      if (input.device) {
        builder.where(`properties['device']`, '=', input.device);
      }

      if (input.browser) {
        builder.where(`properties['browser']`, '=', input.browser);
      }

      const profiles = await builder.limit(input.limit ?? 5).execute();

      return profiles;
    },
  });
}

export function getProfile({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: 'Get a specific profile',
    parameters: z.object({
      projectId: z.string(),
      email: z.string().optional(),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      country: z.string().describe('ISO 3166-1 alpha-2').optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      device: z.string().optional(),
      browser: z.string().optional(),
    }),
    execute: async (input) => {
      const builder = clix(ch)
        .select<IClickhouseProfile>([
          'id',
          'email',
          'first_name',
          'last_name',
          'properties',
        ])
        .from(TABLE_NAMES.profiles)
        .where('project_id', '=', projectId);

      if (input.email) {
        builder.where('email', 'LIKE', `%${input.email}%`);
      }

      if (input.firstName) {
        builder.where('first_name', 'LIKE', `%${input.firstName}%`);
      }

      if (input.lastName) {
        builder.where('last_name', 'LIKE', `%${input.lastName}%`);
      }

      if (input.country) {
        builder.where(`properties['country']`, '=', input.country);
      }

      if (input.city) {
        builder.where(`properties['city']`, '=', input.city);
      }

      if (input.region) {
        builder.where(`properties['region']`, '=', input.region);
      }

      if (input.device) {
        builder.where(`properties['device']`, '=', input.device);
      }

      if (input.browser) {
        builder.where(`properties['browser']`, '=', input.browser);
      }

      const profiles = await builder.limit(1).execute();

      const profile = profiles[0];
      if (!profile) {
        return {
          error: 'Profile not found',
        };
      }

      const events = await clix(ch)
        .select<IClickhouseEvent>([])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', input.projectId)
        .where('profile_id', '=', profile.id)
        .limit(5)
        .orderBy('created_at', 'DESC')
        .execute();

      return {
        profile,
        events,
      };
    },
  });
}

export function getEvents({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: 'Get events for a project or specific profile',
    parameters: z.object({
      projectId: z.string(),
      profileId: z.string().optional(),
      take: z.number().optional().default(10),
      eventNames: z.array(z.string()).optional(),
      referrer: z.string().optional(),
      referrerName: z.string().optional(),
      referrerType: z.string().optional(),
      device: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      os: z.string().optional(),
      browser: z.string().optional(),
      properties: z.record(z.string(), z.string()).optional(),
      startDate: z.string().optional().describe('ISO date string'),
      endDate: z.string().optional().describe('ISO date string'),
    }),
    execute: async (input) => {
      const builder = clix(ch)
        .select<IClickhouseEvent>([])
        .from(TABLE_NAMES.events)
        .where('project_id', '=', projectId);

      if (input.profileId) {
        builder.where('profile_id', '=', input.profileId);
      }

      if (input.eventNames) {
        builder.where('name', 'IN', input.eventNames);
      }

      if (input.referrer) {
        builder.where('referrer', '=', input.referrer);
      }

      if (input.referrerName) {
        builder.where('referrer_name', '=', input.referrerName);
      }

      if (input.referrerType) {
        builder.where('referrer_type', '=', input.referrerType);
      }

      if (input.device) {
        builder.where('device', '=', input.device);
      }

      if (input.country) {
        builder.where('country', '=', input.country);
      }

      if (input.city) {
        builder.where('city', '=', input.city);
      }

      if (input.os) {
        builder.where('os', '=', input.os);
      }

      if (input.browser) {
        builder.where('browser', '=', input.browser);
      }

      if (input.properties) {
        for (const [key, value] of Object.entries(input.properties)) {
          builder.where(`properties['${key}']`, '=', value);
        }
      }

      if (input.startDate && input.endDate) {
        builder.where('created_at', 'BETWEEN', [
          clix.datetime(input.startDate),
          clix.datetime(input.endDate),
        ]);
      } else {
        builder.where('created_at', 'BETWEEN', [
          clix.datetime(new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)),
          clix.datetime(new Date()),
        ]);
      }

      return await builder.limit(input.take).execute();
    },
  });
}

export function getSessions({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: 'Get sessions for a project or specific profile',
    parameters: z.object({
      projectId: z.string(),
      profileId: z.string().optional(),
      take: z.number().optional().default(10),
      referrer: z.string().optional(),
      referrerName: z.string().optional(),
      referrerType: z.string().optional(),
      device: z.string().optional(),
      country: z.string().optional(),
      city: z.string().optional(),
      os: z.string().optional(),
      browser: z.string().optional(),
      properties: z.record(z.string(), z.string()).optional(),
      startDate: z.string().optional().describe('ISO date string'),
      endDate: z.string().optional().describe('ISO date string'),
    }),
    execute: async (input) => {
      const builder = clix(ch)
        .select<IClickhouseSession>([])
        .from(TABLE_NAMES.sessions)
        .where('project_id', '=', projectId)
        .where('sign', '=', 1);

      if (input.profileId) {
        builder.where('profile_id', '=', input.profileId);
      }

      if (input.referrer) {
        builder.where('referrer', '=', input.referrer);
      }

      if (input.referrerName) {
        builder.where('referrer_name', '=', input.referrerName);
      }

      if (input.referrerType) {
        builder.where('referrer_type', '=', input.referrerType);
      }

      if (input.device) {
        builder.where('device', '=', input.device);
      }

      if (input.country) {
        builder.where('country', '=', input.country);
      }

      if (input.city) {
        builder.where('city', '=', input.city);
      }

      if (input.os) {
        builder.where('os', '=', input.os);
      }

      if (input.browser) {
        builder.where('browser', '=', input.browser);
      }

      if (input.properties) {
        for (const [key, value] of Object.entries(input.properties)) {
          builder.where(`properties['${key}']`, '=', value);
        }
      }

      if (input.startDate && input.endDate) {
        builder.where('created_at', 'BETWEEN', [
          clix.datetime(input.startDate),
          clix.datetime(input.endDate),
        ]);
      } else {
        builder.where('created_at', 'BETWEEN', [
          clix.datetime(new Date(Date.now() - 1000 * 60 * 60 * 24 * 7)),
          clix.datetime(new Date()),
        ]);
      }

      return await builder.limit(input.take).execute();
    },
  });
}

export function getAllEventNames({
  projectId,
}: {
  projectId: string;
}) {
  return tool({
    description: 'Get the top 50 event names in a comma separated list',
    parameters: z.object({}),
    execute: async () => {
      return getCache(`top-event-names:${projectId}`, 60 * 10, async () => {
        const events = await clix(ch)
          .select<IClickhouseEvent>(['name', 'count() as count'])
          .from(TABLE_NAMES.event_names_mv)
          .where('project_id', '=', projectId)
          .groupBy(['name'])
          .orderBy('count', 'DESC')
          .limit(50)
          .execute();

        return events.map((event) => event.name).join(',');
      });
    },
  });
}
