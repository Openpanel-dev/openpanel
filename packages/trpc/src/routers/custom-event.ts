import { z } from 'zod';
import { db } from '@openpanel/db';
import {
  zCustomEventInput,
  zCustomEventUpdate,
} from '@openpanel/validation';
import { getProjectAccess } from '../access';
import { TRPCAccessError, TRPCNotFoundError } from '../errors';
import { createTRPCRouter, protectedProcedure } from '../trpc';

export const customEventRouter = createTRPCRouter({
  /**
   * List all custom events for a project
   */
  list: protectedProcedure
    .input(z.object({ projectId: z.string() }))
    .query(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      return db.customEvent.findMany({
        where: { projectId: input.projectId },
        orderBy: { createdAt: 'desc' },
      });
    }),

  /**
   * Get single custom event by ID
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const customEvent = await db.customEvent.findUnique({
        where: { id: input.id },
      });

      if (!customEvent) {
        throw TRPCNotFoundError('Custom event not found');
      }

      const access = await getProjectAccess({
        projectId: customEvent.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this custom event');
      }

      return customEvent;
    }),

  /**
   * Create new custom event
   */
  create: protectedProcedure
    .input(zCustomEventInput)
    .mutation(async ({ input, ctx }) => {
      const access = await getProjectAccess({
        projectId: input.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this project');
      }

      // Check if name already exists (as custom event or regular event)
      const [existingCustom, existingMeta] = await Promise.all([
        db.customEvent.findUnique({
          where: {
            name_projectId: {
              name: input.name,
              projectId: input.projectId,
            },
          },
        }),
        db.eventMeta.findUnique({
          where: {
            name_projectId: {
              name: input.name,
              projectId: input.projectId,
            },
          },
        }),
      ]);

      if (existingCustom || existingMeta) {
        throw new Error('An event with this name already exists');
      }

      return db.customEvent.create({
        data: {
          name: input.name,
          description: input.description,
          projectId: input.projectId,
          definition: input.definition as any,
          conversion: input.conversion,
        },
      });
    }),

  /**
   * Update custom event
   */
  update: protectedProcedure
    .input(zCustomEventUpdate)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;

      const existing = await db.customEvent.findUnique({ where: { id } });
      if (!existing) {
        throw TRPCNotFoundError('Custom event not found');
      }

      const access = await getProjectAccess({
        projectId: existing.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this custom event');
      }

      // If name is being changed, check for conflicts
      if (data.name && data.name !== existing.name) {
        const [existingCustom, existingMeta] = await Promise.all([
          db.customEvent.findUnique({
            where: {
              name_projectId: {
                name: data.name,
                projectId: existing.projectId,
              },
            },
          }),
          db.eventMeta.findUnique({
            where: {
              name_projectId: {
                name: data.name,
                projectId: existing.projectId,
              },
            },
          }),
        ]);

        if (existingCustom || existingMeta) {
          throw new Error('An event with this name already exists');
        }
      }

      return db.customEvent.update({
        where: { id },
        data: data as any,
      });
    }),

  /**
   * Delete custom event
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const existing = await db.customEvent.findUnique({
        where: { id: input.id },
      });
      if (!existing) {
        throw TRPCNotFoundError('Custom event not found');
      }

      const access = await getProjectAccess({
        projectId: existing.projectId,
        userId: ctx.session.userId,
      });
      if (!access) {
        throw TRPCAccessError('You do not have access to this custom event');
      }

      return db.customEvent.delete({
        where: { id: input.id },
      });
    }),
});
