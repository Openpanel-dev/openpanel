import crypto from 'node:crypto';
import { stripTrailingSlash } from '@openpanel/common';
import { hashPassword } from '@openpanel/common/server';
import {
  db,
  getClientByIdCached,
  getId,
  getProjectByIdCached,
} from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '@/utils/errors';

// Validation schemas (exported for use in router)
export const zCreateOrganization = z.object({
  name: z.string().min(1),
  timezone: z.string().optional(),
});

export const zUpdateOrganization = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().optional(),
});

export const zCreateProject = z.object({
  name: z.string().min(1),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).default([]),
  crossDomain: z.boolean().optional().default(false),
  types: z
    .array(z.enum(['website', 'app', 'backend']))
    .optional()
    .default([]),
});

export const zUpdateProject = z.object({
  name: z.string().min(1).optional(),
  domain: z.string().url().or(z.literal('')).or(z.null()).optional(),
  cors: z.array(z.string()).optional(),
  crossDomain: z.boolean().optional(),
  allowUnsafeRevenueTracking: z.boolean().optional(),
});

export const zCreateClient = z.object({
  name: z.string().min(1),
  projectId: z.string().optional(),
  type: z.enum(['read', 'write', 'root']).optional().default('write'),
});

export const zUpdateClient = z.object({
  name: z.string().min(1).optional(),
});

export const zCreateReference = z.object({
  projectId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  datetime: z.string(),
});

export const zUpdateReference = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  datetime: z.string().optional(),
});

// Projects CRUD
export async function listProjects(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const projects = await db.project.findMany({
    where: {
      organizationId: request.client!.organizationId,
      deleteAt: null,
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  reply.send({ data: projects });
}

export async function getProject(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const project = await db.project.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
  });

  if (!project) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({ data: project });
}

export async function createProject(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateProject> }>,
  reply: FastifyReply
) {
  const { name, domain, cors, crossDomain, types } = request.body;

  // Generate a default client secret
  const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;
  const clientData = {
    organizationId: request.client!.organizationId,
    name: 'First client',
    type: 'write' as const,
    secret: await hashPassword(secret),
  };

  const project = await db.project.create({
    data: {
      id: await getId('project', name),
      organizationId: request.client!.organizationId,
      name,
      domain: domain ? stripTrailingSlash(domain) : null,
      cors: cors.map((c) => stripTrailingSlash(c)),
      crossDomain: crossDomain ?? false,
      allowUnsafeRevenueTracking: false,
      filters: [],
      types,
      clients: {
        create: clientData,
      },
    },
    include: {
      clients: {
        select: {
          id: true,
        },
      },
    },
  });

  await Promise.all([
    getProjectByIdCached.clear(project.id),
    ...project.clients.map((client) => getClientByIdCached.clear(client.id)),
  ]);

  reply.send({
    data: {
      ...project,
      client: project.clients[0]
        ? {
            id: project.clients[0].id,
            secret,
          }
        : null,
    },
  });
}

export async function updateProject(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof zUpdateProject>;
  }>,
  reply: FastifyReply
) {
  const body = request.body;

  // Verify project exists and belongs to organization
  const existing = await db.project.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
    include: {
      clients: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!existing) {
    throw new HttpError('Project not found', { status: 404 });
  }

  const updateData: any = {};
  if (body.name !== undefined) {
    updateData.name = body.name;
  }
  if (body.domain !== undefined) {
    updateData.domain = body.domain
      ? stripTrailingSlash(body.domain)
      : null;
  }
  if (body.cors !== undefined) {
    updateData.cors = body.cors.map((c) => stripTrailingSlash(c));
  }
  if (body.crossDomain !== undefined) {
    updateData.crossDomain = body.crossDomain;
  }
  if (body.allowUnsafeRevenueTracking !== undefined) {
    updateData.allowUnsafeRevenueTracking = body.allowUnsafeRevenueTracking;
  }

  const project = await db.project.update({
    where: {
      id: request.params.id,
    },
    data: updateData,
  });

  await Promise.all([
    getProjectByIdCached.clear(project.id),
    ...existing.clients.map((client) => getClientByIdCached.clear(client.id)),
  ]);

  reply.send({ data: project });
}

export async function deleteProject(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const project = await db.project.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
  });

  if (!project) {
    throw new HttpError('Project not found', { status: 404 });
  }

  await db.project.update({
    where: {
      id: request.params.id,
    },
    data: {
      deleteAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  await getProjectByIdCached.clear(request.params.id);

  reply.send({ success: true });
}

// ---------------------------------------------------------------------
// Organizations CRUD
//
// Available to /manage callers authenticated via OIDC JWT
// (`platform-admin`-class roles, see apps/api/src/utils/auth.ts) and to
// root-Client callers for read/update/delete of their own organization.
// Creating *new* organizations is realistically only useful to a
// platform-admin caller — root Clients are scoped to one org and can't
// create siblings — but the endpoint doesn't enforce that gate; it
// trusts that whoever has admin auth is permitted by the operator.
// ---------------------------------------------------------------------

export async function listOrganizations(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // For now, callers see only the org their auth scope is bound to.
  // A platform-admin JWT scoped at the instance level would warrant
  // returning every Organization, but that requires a richer claim
  // model than v1 ships with.
  const org = await db.organization.findFirst({
    where: { id: request.client!.organizationId },
  });
  reply.send({ data: org ? [org] : [] });
}

export async function getOrganization(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const org = await db.organization.findFirst({
    where: {
      id: request.params.id,
      // Same-org scoping. JWT-auth callers can only `get` the org
      // their claim is bound to; cross-org reads require additional
      // claim plumbing we haven't designed yet.
      ...(request.client!.organizationId
        ? { id: request.client!.organizationId }
        : {}),
    },
  });
  if (!org) {
    throw new HttpError('Organization not found', { status: 404 });
  }
  reply.send({ data: org });
}

export async function createOrganization(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateOrganization> }>,
  reply: FastifyReply
) {
  const { name, timezone } = request.body;

  // No createdByUserId on this code path — Organization.createdByUserId
  // is nullable and the relation is SetNull on delete. JWT-auth admins
  // and root Clients are not Users; we leave the field unset so the
  // newly-created Org has no human owner.
  const org = await db.organization.create({
    data: {
      id: await getId('organization', name),
      name,
      timezone: timezone ?? null,
      onboarding: 'completed',
    },
  });

  reply.send({ data: org });
}

export async function updateOrganization(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof zUpdateOrganization>;
  }>,
  reply: FastifyReply
) {
  const existing = await db.organization.findFirst({
    where: { id: request.params.id },
  });
  if (!existing) {
    throw new HttpError('Organization not found', { status: 404 });
  }

  const data: { name?: string; timezone?: string | null } = {};
  if (request.body.name !== undefined) data.name = request.body.name;
  if (request.body.timezone !== undefined) {
    data.timezone = request.body.timezone;
  }

  const org = await db.organization.update({
    where: { id: request.params.id },
    data,
  });
  reply.send({ data: org });
}

export async function deleteOrganization(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const existing = await db.organization.findFirst({
    where: { id: request.params.id },
  });
  if (!existing) {
    throw new HttpError('Organization not found', { status: 404 });
  }

  await db.organization.delete({
    where: { id: request.params.id },
  });
  reply.send({ success: true });
}

// Clients CRUD
export async function listClients(
  request: FastifyRequest<{ Querystring: { projectId?: string } }>,
  reply: FastifyReply
) {
  const where: any = {
    organizationId: request.client!.organizationId,
  };

  if (request.query.projectId) {
    // Verify project belongs to organization
    const project = await db.project.findFirst({
      where: {
        id: request.query.projectId,
        organizationId: request.client!.organizationId,
      },
    });

    if (!project) {
      throw new HttpError('Project not found', { status: 404 });
    }

    where.projectId = request.query.projectId;
  }

  const clients = await db.client.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });

  reply.send({ data: clients });
}

export async function getClient(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const client = await db.client.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
  });

  if (!client) {
    throw new HttpError('Client not found', { status: 404 });
  }

  reply.send({ data: client });
}

export async function createClient(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateClient> }>,
  reply: FastifyReply
) {
  const { name, projectId, type } = request.body;

  // If projectId is provided, verify it belongs to organization
  if (projectId) {
    const project = await db.project.findFirst({
      where: {
        id: projectId,
        organizationId: request.client!.organizationId,
      },
    });

    if (!project) {
      throw new HttpError('Project not found', { status: 404 });
    }
  }

  // Generate secret
  const secret = `sec_${crypto.randomBytes(10).toString('hex')}`;

  const client = await db.client.create({
    data: {
      organizationId: request.client!.organizationId,
      projectId: projectId || null,
      name,
      type: type || 'write',
      secret: await hashPassword(secret),
    },
  });

  await getClientByIdCached.clear(client.id);

  reply.send({
    data: {
      ...client,
      secret, // Return plain secret only once
    },
  });
}

export async function updateClient(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof zUpdateClient>;
  }>,
  reply: FastifyReply
) {
  // Verify client exists and belongs to organization
  const existing = await db.client.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
  });

  if (!existing) {
    throw new HttpError('Client not found', { status: 404 });
  }

  const updateData: any = {};
  if (request.body.name !== undefined) {
    updateData.name = request.body.name;
  }

  const client = await db.client.update({
    where: {
      id: request.params.id,
    },
    data: updateData,
  });

  await getClientByIdCached.clear(client.id);

  reply.send({ data: client });
}

export async function deleteClient(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const client = await db.client.findFirst({
    where: {
      id: request.params.id,
      organizationId: request.client!.organizationId,
    },
  });

  if (!client) {
    throw new HttpError('Client not found', { status: 404 });
  }

  await db.client.delete({
    where: {
      id: request.params.id,
    },
  });

  await getClientByIdCached.clear(request.params.id);

  reply.send({ success: true });
}

// References CRUD
export async function listReferences(
  request: FastifyRequest<{ Querystring: { projectId?: string } }>,
  reply: FastifyReply
) {
  const where: any = {};

  if (request.query.projectId) {
    // Verify project belongs to organization
    const project = await db.project.findFirst({
      where: {
        id: request.query.projectId,
        organizationId: request.client!.organizationId,
      },
    });

    if (!project) {
      throw new HttpError('Project not found', { status: 404 });
    }

    where.projectId = request.query.projectId;
  } else {
    // If no projectId, get all projects in org and filter references
    const projects = await db.project.findMany({
      where: {
        organizationId: request.client!.organizationId,
      },
      select: { id: true },
    });

    where.projectId = {
      in: projects.map((p) => p.id),
    };
  }

  const references = await db.reference.findMany({
    where,
    orderBy: {
      createdAt: 'desc',
    },
  });

  reply.send({ data: references });
}

export async function getReference(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const reference = await db.reference.findUnique({
    where: {
      id: request.params.id,
    },
    include: {
      project: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!reference) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  if (reference.project.organizationId !== request.client!.organizationId) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  reply.send({ data: reference });
}

export async function createReference(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateReference> }>,
  reply: FastifyReply
) {
  const { projectId, title, description, datetime } = request.body;

  // Verify project belongs to organization
  const project = await db.project.findFirst({
    where: {
      id: projectId,
      organizationId: request.client!.organizationId,
    },
  });

  if (!project) {
    throw new HttpError('Project not found', { status: 404 });
  }

  const reference = await db.reference.create({
    data: {
      projectId,
      title,
      description: description || null,
      date: new Date(datetime),
    },
  });

  reply.send({ data: reference });
}

export async function updateReference(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof zUpdateReference>;
  }>,
  reply: FastifyReply
) {
  const body = request.body;

  // Verify reference exists and belongs to organization
  const existing = await db.reference.findUnique({
    where: {
      id: request.params.id,
    },
    include: {
      project: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!existing) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  if (existing.project.organizationId !== request.client!.organizationId) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  const updateData: any = {};
  if (body.title !== undefined) {
    updateData.title = body.title;
  }
  if (body.description !== undefined) {
    updateData.description = body.description ?? null;
  }
  if (body.datetime !== undefined) {
    updateData.date = new Date(body.datetime);
  }

  const reference = await db.reference.update({
    where: {
      id: request.params.id,
    },
    data: updateData,
  });

  reply.send({ data: reference });
}

export async function deleteReference(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const reference = await db.reference.findUnique({
    where: {
      id: request.params.id,
    },
    include: {
      project: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!reference) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  if (reference.project.organizationId !== request.client!.organizationId) {
    throw new HttpError('Reference not found', { status: 404 });
  }

  await db.reference.delete({
    where: {
      id: request.params.id,
    },
  });

  reply.send({ success: true });
}
