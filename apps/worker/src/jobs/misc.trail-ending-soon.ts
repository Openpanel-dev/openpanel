import { db } from '@openpanel/db';
import { sendEmail } from '@openpanel/email';
import type { MiscQueuePayloadTrialEndingSoon } from '@openpanel/queue';
import type { Job } from 'bullmq';

export async function trialEndingSoonJob(
  job: Job<MiscQueuePayloadTrialEndingSoon>,
) {
  const { organizationId } = job.data.payload;

  const organization = await db.organization.findUnique({
    where: {
      id: organizationId,
    },
    include: {
      createdBy: {
        select: {
          email: true,
        },
      },
      projects: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!organization) {
    return;
  }

  const project = organization.projects[0];

  if (!organization.createdBy?.email) {
    return;
  }

  if (!project) {
    return;
  }

  return sendEmail('trial-ending-soon', {
    to: organization.createdBy?.email,
    data: {
      organizationName: organization.name,
      url: `https://dashboard.openpanel.dev/${organization.id}/${project.id}/settings/organization?tab=billing`,
    },
  });
}
