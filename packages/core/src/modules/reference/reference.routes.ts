import { z } from 'zod';
import { defineRoutes } from '../../http/define';
import {
  zManageCreateReference,
  zManageUpdateReference,
} from './reference.constants';

const idParams = z.object({ id: z.string() });
const listQuery = z.object({ projectId: z.string().optional() });
const MANAGE_TAGS = ['Manage'];

export const referenceRoutes = defineRoutes((app) =>
  app
    .get(
      '/manage/references',
      async ({ client, ctx, query, status }) => {
        const references =
          await ctx.services.reference.listReferencesForOrganization(
            client.organizationId,
            query.projectId
          );
        if (references === null) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { data: references };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        query: listQuery,
        detail: {
          tags: MANAGE_TAGS,
          description: 'List annotation references for a project.',
        },
      }
    )
    .get(
      '/manage/references/:id',
      async ({ client, ctx, params, status }) => {
        const reference =
          await ctx.services.reference.getReferenceForOrganization(
            params.id,
            client.organizationId
          );
        if (!reference) {
          return status(404, {
            error: 'Not Found',
            message: 'Reference not found',
          });
        }
        return { data: reference };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: {
          tags: MANAGE_TAGS,
          description: 'Get a single annotation reference by ID.',
        },
      }
    )
    .post(
      '/manage/references',
      async ({ body, client, ctx, status }) => {
        const reference =
          await ctx.services.reference.createReferenceForOrganization(
            client.organizationId,
            body
          );
        if (!reference) {
          return status(404, {
            error: 'Not Found',
            message: 'Project not found',
          });
        }
        return { data: reference };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        body: zManageCreateReference,
        detail: { tags: MANAGE_TAGS },
      }
    )
    .patch(
      '/manage/references/:id',
      async ({ body, client, ctx, params, status }) => {
        const reference =
          await ctx.services.reference.updateReferenceForOrganization(
            params.id,
            client.organizationId,
            body
          );
        if (!reference) {
          return status(404, {
            error: 'Not Found',
            message: 'Reference not found',
          });
        }
        return { data: reference };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        body: zManageUpdateReference,
        detail: { tags: MANAGE_TAGS },
      }
    )
    .delete(
      '/manage/references/:id',
      async ({ client, ctx, params, status }) => {
        const deleted =
          await ctx.services.reference.deleteReferenceForOrganization(
            params.id,
            client.organizationId
          );
        if (!deleted) {
          return status(404, {
            error: 'Not Found',
            message: 'Reference not found',
          });
        }
        return { success: true };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: idParams,
        detail: { tags: MANAGE_TAGS },
      }
    )
);
