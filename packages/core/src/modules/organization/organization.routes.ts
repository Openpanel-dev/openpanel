// The /manage/members REST surface lets an outside directory own who is in the
// root client's organization. Self-hosted only: a member put here gets a
// verified email, which is the operator's word, not the caller's.

import { defineRoutes } from '../../http/define';
import {
  zManagedMemberParams,
  zPutManagedMember,
} from './organization.constants';

const NOT_FOUND = { error: 'Not Found', message: 'Not found' } as const;
const OWNER_REFUSED = {
  error: 'Conflict',
  message: 'The organization owner is managed in the dashboard',
} as const;

export const organizationRoutes = defineRoutes((app) =>
  app
    .get(
      '/manage/members',
      async ({ client, ctx, status }) => {
        if (!ctx.config.selfHosted) {
          return status(404, NOT_FOUND);
        }
        return {
          data: await ctx.services.organization.listManagedMembers(
            client.organizationId
          ),
        };
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        detail: { tags: ['Manage'] },
      }
    )
    .put(
      '/manage/members/:email',
      async ({ body, client, ctx, params, status }) => {
        if (!ctx.config.selfHosted) {
          return status(404, NOT_FOUND);
        }
        const result = await ctx.services.organization.putManagedMember({
          ...body,
          organizationId: client.organizationId,
          email: params.email,
        });
        if (result.ok) {
          return { data: result.member };
        }
        if (result.reason === 'owner') {
          return status(409, OWNER_REFUSED);
        }
        return status(400, {
          error: 'Bad Request',
          message: `Project not in this organization: ${result.projectIds.join(', ')}`,
        });
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: zManagedMemberParams,
        body: zPutManagedMember,
        detail: { tags: ['Manage'] },
      }
    )
    .delete(
      '/manage/members/:email',
      async ({ client, ctx, params, status }) => {
        if (!ctx.config.selfHosted) {
          return status(404, NOT_FOUND);
        }
        const result = await ctx.services.organization.removeManagedMember({
          organizationId: client.organizationId,
          email: params.email,
        });
        if (result.ok) {
          return { success: true };
        }
        if (result.reason === 'owner') {
          return status(409, OWNER_REFUSED);
        }
        return status(404, NOT_FOUND);
      },
      {
        clientAuth: { allow: ['root'], label: 'Manage' },
        params: zManagedMemberParams,
        detail: { tags: ['Manage'] },
      }
    )
);
