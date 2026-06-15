import {
  buildBigQueryClient,
  db,
  decrypt,
  encrypt,
  getWarehouseClient,
  listWarehouseDatasets,
  listWarehouseTables,
  getWarehouseTableSchema,
  mapBigQueryError,
  withTimeout,
} from '@openpanel/db';
import {
  zWarehouseConfig,
  zWarehouseConnectionCreate,
} from '@openpanel/validation';
import { z } from 'zod';
import { getProjectAccess } from '../access';
import {
  TRPCBadRequestError,
  TRPCForbiddenError,
  TRPCNotFoundError,
} from '../errors';
import { createTRPCRouter, protectedProcedure, rateLimitMiddleware } from '../trpc';

const zConnectionOwnership = z.object({
  connectionId: z.string().uuid(),
  projectId: z.string(),
});

async function assertConnectionOwnership(connectionId: string, projectId: string) {
  const conn = await db.warehouseConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      projectId: true,
      displayIdentifier: true,
      type: true,
    },
  });
  if (!conn) throw new TRPCNotFoundError('Warehouse connection not found');
  if (conn.projectId !== projectId)
    throw new TRPCForbiddenError('You do not have access to this connection');
  return conn;
}

export const warehouseRouter = createTRPCRouter({
  listConnections: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      return db.warehouseConnection.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          name: true,
          type: true,
          displayIdentifier: true,
          displayEmail: true,
          lastTestedAt: true,
          lastTestStatus: true,
          lastTestError: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { syncs: true } },
        },
      });
    }),

  connect: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(
      z.object({ projectId: z.string() }).merge(zWarehouseConnectionCreate),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      // Test credentials BEFORE any DB write — fail fast
      const bq = buildBigQueryClient(input.config);
      try {
        await withTimeout(bq.getDatasets(), 10_000, 'listDatasets');
      } catch (err) {
        throw new TRPCBadRequestError(mapBigQueryError(err));
      }

      const saJson = JSON.parse(input.config.serviceAccountJson) as {
        client_email?: string;
      };

      const now = new Date();
      try {
        const conn = await db.warehouseConnection.create({
          data: {
            projectId: input.projectId,
            name: input.name,
            type: input.config.type,
            configEncrypted: encrypt(JSON.stringify(input.config)),
            displayIdentifier: input.config.gcpProjectId,
            displayEmail: saJson.client_email ?? null,
            lastTestedAt: now,
            lastTestStatus: true,
            lastTestError: null,
          },
          select: {
            id: true,
            name: true,
            type: true,
            displayIdentifier: true,
            displayEmail: true,
            lastTestedAt: true,
            lastTestStatus: true,
            lastTestError: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { syncs: true } },
          },
        });
        return conn;
      } catch (err) {
        // P2002 = unique constraint — duplicate name within project
        if ((err as { code?: string })?.code === 'P2002') {
          throw new TRPCBadRequestError(
            `A connection named "${input.name}" already exists in this project.`,
          );
        }
        throw err;
      }
    }),

  testConnection: protectedProcedure
    .use(rateLimitMiddleware({ max: 10, windowMs: 60_000 }))
    .input(zConnectionOwnership)
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      await assertConnectionOwnership(input.connectionId, input.projectId);

      const now = new Date();
      try {
        await listWarehouseDatasets(input.connectionId, input.projectId);
        await db.warehouseConnection.update({
          where: { id: input.connectionId },
          data: { lastTestedAt: now, lastTestStatus: true, lastTestError: null },
        });
        return { ok: true };
      } catch (err) {
        const errorMsg = mapBigQueryError(err);
        await db.warehouseConnection.update({
          where: { id: input.connectionId },
          data: {
            lastTestedAt: now,
            lastTestStatus: false,
            lastTestError: errorMsg,
          },
        });
        throw new TRPCBadRequestError(errorMsg);
      }
    }),

  updateConnection: protectedProcedure
    .use(rateLimitMiddleware({ max: 5, windowMs: 60_000 }))
    .input(
      zConnectionOwnership.extend({
        config: zWarehouseConfig,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      const conn = await assertConnectionOwnership(
        input.connectionId,
        input.projectId,
      );

      // Block provider type change
      if (input.config.type !== conn.type) {
        throw new TRPCBadRequestError(
          'Cannot change the provider type. Disconnect and create a new connection instead.',
        );
      }

      // Block GCP project ID change — would silently break all existing sync table references
      if (
        input.config.type === 'bigquery' &&
        input.config.gcpProjectId !== conn.displayIdentifier
      ) {
        throw new TRPCBadRequestError(
          'Cannot change GCP project ID. Disconnect and create a new connection to use a different project.',
        );
      }

      // Preserve gcpRegion from the existing encrypted config when the caller (RotateKeyDialog)
      // doesn't supply it — gcpRegion is never stored as a plain-text display field so the UI
      // has no way to round-trip it; dropping it would silently break Phase 4 queries against
      // non-US datasets ("Location X does not support jobs without an explicit location").
      let mergedConfig = input.config;
      if (input.config.type === 'bigquery' && !input.config.gcpRegion) {
        const existingRow = await db.warehouseConnection.findUnique({
          where: { id: input.connectionId },
          select: { configEncrypted: true },
        });
        if (existingRow) {
          const existingConfig = zWarehouseConfig.safeParse(
            JSON.parse(decrypt(existingRow.configEncrypted)),
          );
          if (
            existingConfig.success &&
            existingConfig.data.type === 'bigquery' &&
            existingConfig.data.gcpRegion
          ) {
            mergedConfig = { ...input.config, gcpRegion: existingConfig.data.gcpRegion };
          }
        }
      }

      // Test new credentials BEFORE saving — if they fail, old config stays untouched
      // No cast — when a new provider arm is added to zWarehouseConfig, TypeScript will
      // error here and force a proper switch/case dispatch per provider.
      const bq = buildBigQueryClient(mergedConfig);
      try {
        await withTimeout(bq.getDatasets(), 10_000, 'listDatasets');
      } catch (err) {
        throw new TRPCBadRequestError(mapBigQueryError(err));
      }

      const saJson = JSON.parse(mergedConfig.serviceAccountJson) as {
        client_email?: string;
      };

      const now = new Date();
      return db.warehouseConnection.update({
        where: { id: input.connectionId },
        data: {
          configEncrypted: encrypt(JSON.stringify(mergedConfig)),
          displayEmail: saJson.client_email ?? null,
          lastTestedAt: now,
          lastTestStatus: true,
          lastTestError: null,
        },
        select: {
          id: true,
          name: true,
          type: true,
          displayIdentifier: true,
          displayEmail: true,
          lastTestedAt: true,
          lastTestStatus: true,
          lastTestError: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { syncs: true } },
        },
      });
    }),

  disconnect: protectedProcedure
    .input(zConnectionOwnership)
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      try {
        await assertConnectionOwnership(input.connectionId, input.projectId);
      } catch (err) {
        // Already deleted — desired state reached; let Forbidden still propagate
        if (err instanceof TRPCNotFoundError) return { ok: true };
        throw err;
      }

      // Block disconnect while a sync job is actively running — deleting mid-run would
      // orphan the in-flight ClickHouse writes and produce an incomplete dataset.
      const runningSyncs = await db.warehouseSyncRun.count({
        where: {
          sync: { connectionId: input.connectionId },
          status: 'running',
        },
      });
      if (runningSyncs > 0) {
        throw new TRPCBadRequestError(
          'A sync is currently running on this connection. Wait for it to finish before disconnecting.',
        );
      }

      try {
        await db.warehouseConnection.delete({
          where: { id: input.connectionId },
        });
      } catch (err) {
        // P2025 = already deleted between ownership check and delete (race)
        if ((err as { code?: string })?.code !== 'P2025') throw err;
      }

      return { ok: true };
    }),

  listDatasets: protectedProcedure
    .input(zConnectionOwnership)
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      await assertConnectionOwnership(input.connectionId, input.projectId);

      try {
        return await listWarehouseDatasets(input.connectionId, input.projectId);
      } catch (err) {
        throw new TRPCBadRequestError(mapBigQueryError(err));
      }
    }),

  listTables: protectedProcedure
    .input(zConnectionOwnership.extend({ dataset: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Invalid dataset name') }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      await assertConnectionOwnership(input.connectionId, input.projectId);

      try {
        return await listWarehouseTables(
          input.connectionId,
          input.projectId,
          input.dataset,
        );
      } catch (err) {
        throw new TRPCBadRequestError(mapBigQueryError(err));
      }
    }),

  getTableSchema: protectedProcedure
    .input(
      zConnectionOwnership.extend({
        dataset: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Invalid dataset name'),
        tableName: z.string().regex(/^[a-zA-Z0-9_]+$/, 'Invalid table name'),
      }),
    )
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access)
        throw new TRPCForbiddenError('You do not have access to this project');

      await assertConnectionOwnership(input.connectionId, input.projectId);

      try {
        return await getWarehouseTableSchema(
          input.connectionId,
          input.projectId,
          input.dataset,
          input.tableName,
        );
      } catch (err) {
        throw new TRPCBadRequestError(mapBigQueryError(err));
      }
    }),
});
