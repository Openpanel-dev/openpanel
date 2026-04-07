import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { db } from '@openpanel/db';
import type { McpAuthContext } from '../auth';
import { withErrorHandling } from './shared';

export async function listProjectsCore(input: {
  clientType: 'root' | 'read';
  organizationId: string;
  projectId: string | null;
}) {
  if (input.clientType === 'root') {
    const projects = await db.project.findMany({
      where: { organizationId: input.organizationId },
      orderBy: { eventsCount: 'desc' },
      select: {
        id: true,
        name: true,
        organizationId: true,
        eventsCount: true,
        domain: true,
        types: true,
      },
    });
    return { clientType: 'root', projects };
  }

  const project = input.projectId
    ? await db.project.findUnique({
        where: { id: input.projectId },
        select: {
          id: true,
          name: true,
          organizationId: true,
          eventsCount: true,
          domain: true,
          types: true,
        },
      })
    : null;

  return {
    clientType: 'read',
    projects: project ? [project] : [],
  };
}

export function registerProjectTools(
  server: McpServer,
  context: McpAuthContext,
) {
  server.tool(
    'list_projects',
    context.clientType === 'root'
      ? 'List all projects in your organization. Use the returned project IDs when calling other tools that require a projectId.'
      : 'Returns the single project this client has access to.',
    {},
    async () =>
      withErrorHandling(async () => {
        if (context.clientType === 'root') {
          const projects = await db.project.findMany({
            where: { organizationId: context.organizationId },
            orderBy: { eventsCount: 'desc' },
            select: {
              id: true,
              name: true,
              organizationId: true,
              eventsCount: true,
              domain: true,
              types: true,
            },
          });
          return { clientType: 'root', projects };
        }

        const project = context.projectId
          ? await db.project.findUnique({
              where: { id: context.projectId },
              select: {
                id: true,
                name: true,
                organizationId: true,
                eventsCount: true,
                domain: true,
                types: true,
              },
            })
          : null;

        return {
          clientType: 'read',
          projects: project ? [project] : [],
        };
      }),
  );
}
