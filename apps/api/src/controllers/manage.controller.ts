import {
  createClientForOrganization,
  createProjectForOrganization,
  deleteClientForOrganization,
  deleteProjectForOrganization,
  getClientForOrganization,
  getProjectForOrganization,
  listClientsForOrganization,
  listProjectsForOrganization,
  updateClientForOrganization,
  updateProjectForOrganization,
} from '@openpanel/core';
import type {
  zCreateProject,
  zUpdateProject,
} from '@openpanel/core/modules/project/project.constants';
import { db } from '@openpanel/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpError } from '@/utils/errors';

// project.service.ts + client.service.ts's /manage CRUD bodies (M6-002,
// DELEGATE PATTERN) — zCreateProject/zUpdateProject moved with them
// (project owns "C"); re-exported here for manage.router.ts's schemas.
export {
  zCreateProject,
  zUpdateProject,
} from '@openpanel/core/modules/project/project.constants';

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

// Projects CRUD — delegates to @openpanel/core's project.service.ts
// (M6-002, DELEGATE PATTERN).
export async function listProjects(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const projects = await listProjectsForOrganization(
    request.client!.organizationId
  );
  reply.send({ data: projects });
}

export async function getProject(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const project = await getProjectForOrganization(
    request.params.id,
    request.client!.organizationId
  );

  if (!project) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({ data: project });
}

export async function createProject(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateProject> }>,
  reply: FastifyReply
) {
  const { project, client } = await createProjectForOrganization(
    request.client!.organizationId,
    request.body
  );

  reply.send({ data: { ...project, client } });
}

export async function updateProject(
  request: FastifyRequest<{
    Params: { id: string };
    Body: z.infer<typeof zUpdateProject>;
  }>,
  reply: FastifyReply
) {
  const project = await updateProjectForOrganization(
    request.params.id,
    request.client!.organizationId,
    request.body
  );

  if (!project) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({ data: project });
}

export async function deleteProject(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const deleted = await deleteProjectForOrganization(
    request.params.id,
    request.client!.organizationId
  );

  if (!deleted) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({ success: true });
}

// Clients CRUD — delegates to @openpanel/core's client.service.ts
// (M6-002, DELEGATE PATTERN).
export async function listClients(
  request: FastifyRequest<{ Querystring: { projectId?: string } }>,
  reply: FastifyReply
) {
  const clients = await listClientsForOrganization(
    request.client!.organizationId,
    request.query.projectId
  );

  if (clients === null) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({ data: clients });
}

export async function getClient(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const client = await getClientForOrganization(
    request.params.id,
    request.client!.organizationId
  );

  if (!client) {
    throw new HttpError('Client not found', { status: 404 });
  }

  reply.send({ data: client });
}

export async function createClient(
  request: FastifyRequest<{ Body: z.infer<typeof zCreateClient> }>,
  reply: FastifyReply
) {
  const created = await createClientForOrganization(
    request.client!.organizationId,
    request.body
  );

  if (!created) {
    throw new HttpError('Project not found', { status: 404 });
  }

  reply.send({
    data: {
      ...created.client,
      secret: created.secret, // Return plain secret only once
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
  const client = await updateClientForOrganization(
    request.params.id,
    request.client!.organizationId,
    request.body
  );

  if (!client) {
    throw new HttpError('Client not found', { status: 404 });
  }

  reply.send({ data: client });
}

export async function deleteClient(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply
) {
  const deleted = await deleteClientForOrganization(
    request.params.id,
    request.client!.organizationId
  );

  if (!deleted) {
    throw new HttpError('Client not found', { status: 404 });
  }

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
