import { afterAll, beforeAll, expect, mock, test } from 'bun:test';
import type { Cohort } from '@openpanel/db/src/prisma-client';
import type { ServiceDeps } from '../../services';
import type { CohortDefinition } from './cohort.constants';

const ORGANIZATION_ID = 'cohort-duplicate-org';
const PROJECT_ID = 'cohort-duplicate-project';
const COMPUTED_AT = new Date('2026-10-20T08:00:00.000Z');

const DEFINITION: CohortDefinition = {
  type: 'event',
  criteria: {
    operator: 'or',
    events: [
      {
        name: 'purchase',
        filters: [
          { id: 'f1', name: 'payment', operator: 'is', value: ['card'] },
        ],
        timeframe: { type: 'relative', value: '30d' },
        frequency: { operator: 'gte', count: 2 },
      },
    ],
  },
};

const enqueue = mock(async (_payload: { cohortId: string }) => undefined);

let deps: ServiceDeps;
let service: ReturnType<typeof import('./cohort.service').createCohortService>;
let original: Cohort;

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const { testServiceDeps, testServices } = await import(
    '../../../test/service-deps'
  );
  deps = await testServiceDeps({
    queues: {
      cohortCompute: { cohortCompute: { add: enqueue } },
    } as unknown as ServiceDeps['queues'],
  });
  const { createCohortService } = await import('./cohort.service');
  service = createCohortService(deps, testServices());

  await deps.db.organization.upsert({
    where: { id: ORGANIZATION_ID },
    create: { id: ORGANIZATION_ID, name: 'Cohort org', timezone: 'UTC' },
    update: {},
  });
  await deps.db.project.upsert({
    where: { id: PROJECT_ID },
    create: { id: PROJECT_ID, name: 'Cohort', organizationId: ORGANIZATION_ID },
    update: {},
  });
  await deps.db.cohort.deleteMany({ where: { projectId: PROJECT_ID } });
  original = await deps.db.cohort.create({
    data: {
      name: 'Repeat buyers',
      description: 'Bought twice by card',
      projectId: PROJECT_ID,
      definition: DEFINITION,
      isStatic: true,
      profileCount: 42,
      lastComputedAt: COMPUTED_AT,
    },
  });
});

afterAll(async () => {
  await deps.db.cohort.deleteMany({ where: { projectId: PROJECT_ID } });
  await deps.db.project.deleteMany({ where: { id: PROJECT_ID } });
  await deps.db.organization.deleteMany({ where: { id: ORGANIZATION_ID } });
});

test('copies the definition and starts a compute for the copy', async () => {
  const copy = await service.duplicate(original);

  expect(copy.id).not.toBe(original.id);
  expect(copy).toMatchObject({
    name: 'Copy of Repeat buyers',
    description: 'Bought twice by card',
    projectId: PROJECT_ID,
    definition: DEFINITION,
    isStatic: true,
    profileCount: 0,
    lastComputedAt: null,
  });
  expect(enqueue).toHaveBeenCalledWith(
    { cohortId: copy.id },
    { deduplicationId: `cohort-${copy.id}` }
  );
});

test('leaves the original untouched, also when the copy is edited', async () => {
  const copy = await service.duplicate(original);
  await deps.db.cohort.update({
    where: { id: copy.id },
    data: {
      name: 'Edited',
      definition: {
        type: 'property',
        criteria: { operator: 'and', properties: [] },
      },
    },
  });

  expect(
    await deps.db.cohort.findUniqueOrThrow({ where: { id: original.id } })
  ).toEqual(original);
});
