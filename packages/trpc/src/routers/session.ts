import { z } from 'zod';

import {
  getSessionList,
  getSessionReplayChunksAroundTime,
  getSessionReplayChunksByIndexRange,
  getSessionReplayChunksFrom,
  getSessionReplayMeta,
  sessionHasReplay,
  sessionService,
} from '@openpanel/db';
import { zChartEventFilter } from '@openpanel/validation';

import { createTRPCRouter, protectedProcedure } from '../trpc';

export function encodeCursor(cursor: {
  createdAt: string;
  id: string;
}): string {
  const json = JSON.stringify(cursor);
  return Buffer.from(json, 'utf8').toString('base64url'); // URL-safe
}

export function decodeCursor(
  encoded: string,
): { createdAt: string; id: string } | null {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf8');
    const obj = JSON.parse(json);
    if (typeof obj.createdAt === 'string' && typeof obj.id === 'string') {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

export const sessionRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string(),
        profileId: z.string().optional(),
        cursor: z.string().nullish(),
        filters: z.array(zChartEventFilter).default([]),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        search: z.string().optional(),
        take: z.number().default(50),
      }),
    )
    .query(async ({ input }) => {
      const cursor = input.cursor ? decodeCursor(input.cursor) : null;
      const data = await getSessionList({
        ...input,
        cursor,
      });
      return {
        data: data.items,
        meta: {
          next: data.meta.next ? encodeCursor(data.meta.next) : undefined,
        },
      };
    }),

  byId: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(async ({ input: { sessionId, projectId } }) => {
      return sessionService.byId(sessionId, projectId);
    }),

  hasReplay: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(({ input: { sessionId, projectId } }) => {
      return sessionHasReplay(sessionId, projectId);
    }),

  replayChunksFrom: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        fromIndex: z.number().int().min(0).default(0),
      }),
    )
    .query(({ input: { sessionId, projectId, fromIndex } }) => {
      return getSessionReplayChunksFrom(sessionId, projectId, fromIndex);
    }),

  replayMeta: protectedProcedure
    .input(z.object({ sessionId: z.string(), projectId: z.string() }))
    .query(({ input: { sessionId, projectId } }) => {
      return getSessionReplayMeta(sessionId, projectId);
    }),

  replayChunksByIndexRange: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        fromIndex: z.number().min(0),
        toIndex: z.number().min(0),
      }),
    )
    .query(({ input: { sessionId, projectId, fromIndex, toIndex } }) => {
      return getSessionReplayChunksByIndexRange(
        sessionId,
        projectId,
        fromIndex,
        toIndex,
      );
    }),

  /**
   * Smart seek — given a target wall-clock ms inside the session, returns the
   * latest full-snapshot chunk before the target plus everything through
   * target + lookahead. One round trip, ~30 sec of chunks, regardless of how
   * far into the session the target is.
   */
  replayChunksAroundTime: protectedProcedure
    .input(
      z.object({
        sessionId: z.string(),
        projectId: z.string(),
        // Accept floats — rrweb timestamps can be non-integer (Math.random
        // jitter in chunked emission, accumulating ms drift). Floored
        // server-side inside getSessionReplayChunksAroundTime.
        targetMs: z.number().min(0),
        lookaheadMs: z.number().min(0).max(120_000).default(30_000),
      }),
    )
    .query(({ input: { sessionId, projectId, targetMs, lookaheadMs } }) => {
      return getSessionReplayChunksAroundTime(
        sessionId,
        projectId,
        targetMs,
        lookaheadMs,
      );
    }),
});
