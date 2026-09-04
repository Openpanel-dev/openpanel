// Dissolved into @openpanel/core's profile module (M7-002): the ClickHouse
// queries moved to packages/core/src/modules/profile/profile.service.ts and
// src/profile.sql.ts. This router stays (DELEGATE PATTERN) — it keeps V1's
// protectedProcedure stack and delegates every handler body to core's
// profile functions, same as session.ts.

import {
  getPowerUsers,
  getProfileActivity,
  getProfileById,
  getProfileListPage,
  getProfileMetrics,
  getProfileMostEvents,
  getProfilePopularRoutes,
  getProfilePropertyNames,
  getProfileValues,
} from '@openpanel/core';
import { zChartEventFilter } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const zProfileRef = z.object({ profileId: z.string(), projectId: z.string() });

export const profileRouter = createTRPCRouter({
  byId: protectedProcedure
    .input(zProfileRef)
    .query(({ input: { profileId, projectId } }) =>
      getProfileById(profileId, projectId)
    ),

  metrics: protectedProcedure
    .input(zProfileRef)
    .query(({ input: { profileId, projectId } }) =>
      getProfileMetrics(profileId, projectId)
    ),

  activity: protectedProcedure
    .input(zProfileRef)
    .query(({ input: { profileId, projectId } }) =>
      getProfileActivity(profileId, projectId)
    ),

  mostEvents: protectedProcedure
    .input(zProfileRef)
    .query(({ input: { profileId, projectId } }) =>
      getProfileMostEvents(profileId, projectId)
    ),

  popularRoutes: protectedProcedure
    .input(zProfileRef)
    .query(({ input: { profileId, projectId } }) =>
      getProfilePopularRoutes(profileId, projectId)
    ),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => getProfilePropertyNames(projectId)),

  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        isExternal: z.boolean().optional(),
        filters: z.array(zChartEventFilter).default([]),
      })
    )
    .query(({ input }) => getProfileListPage(input)),

  powerUsers: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
      })
    )
    .query(({ input }) => getPowerUsers(input)),

  values: protectedProcedure
    .input(z.object({ property: z.string(), projectId: z.string() }))
    .query(({ input }) => getProfileValues(input)),
});
