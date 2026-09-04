// Dissolved into @openpanel/core's group module (M7-002): the ClickHouse
// queries moved to packages/core/src/modules/group/group.service.ts and
// src/group.sql.ts. This router stays (DELEGATE PATTERN) — it keeps V1's
// protectedProcedure stack and delegates every handler body to core's group
// functions, same as session.ts.

import {
  createGroup,
  deleteGroup,
  getGroupActivity,
  getGroupById,
  getGroupListPage,
  getGroupMemberGrowth,
  getGroupMemberProfilesPage,
  getGroupMetrics,
  getGroupMostEvents,
  getGroupPopularRoutes,
  getGroupPropertyKeys,
  getGroupsByIds,
  getGroupTypes,
  updateGroup,
} from '@openpanel/core';
import { zCreateGroup, zUpdateGroup } from '@openpanel/validation';
import { z } from 'zod';
import { createTRPCRouter, protectedProcedure } from '../trpc';

const zGroupRef = z.object({ id: z.string(), projectId: z.string() });

export const groupRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
        type: z.string().optional(),
      })
    )
    .query(({ input }) => getGroupListPage(input)),

  byId: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) => getGroupById(id, projectId)),

  create: protectedProcedure
    .input(zCreateGroup)
    .mutation(({ input }) => createGroup(input)),

  update: protectedProcedure
    .input(zUpdateGroup)
    .mutation(({ input: { id, projectId, ...data } }) =>
      updateGroup(id, projectId, data)
    ),

  delete: protectedProcedure
    .input(zGroupRef)
    .mutation(({ input: { id, projectId } }) => deleteGroup(id, projectId)),

  types: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => getGroupTypes(projectId)),

  metrics: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) => getGroupMetrics(id, projectId)),

  activity: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) => getGroupActivity(id, projectId)),

  memberGrowth: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) =>
      getGroupMemberGrowth(id, projectId)
    ),

  listProfiles: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        groupId: z.string(),
        cursor: z.number().optional(),
        take: z.number().default(50),
        search: z.string().optional(),
      })
    )
    .query(({ input }) => getGroupMemberProfilesPage(input)),

  mostEvents: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) => getGroupMostEvents(id, projectId)),

  popularRoutes: protectedProcedure
    .input(zGroupRef)
    .query(({ input: { id, projectId } }) =>
      getGroupPopularRoutes(id, projectId)
    ),

  properties: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(({ input: { projectId } }) => getGroupPropertyKeys(projectId)),

  listByIds: protectedProcedure
    .input(z.object({ projectId: z.string(), ids: z.array(z.string()) }))
    .query(({ input: { projectId, ids } }) => getGroupsByIds(projectId, ids)),
});
