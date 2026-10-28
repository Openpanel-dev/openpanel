import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ServiceDeps } from '../../services';

const ORGANIZATION_ID = 'dashboard-duplicate-org';
const PROJECT_ID = 'dashboard-duplicate-project';
const DASHBOARD_ID = 'dashboard-duplicate-source';

let deps: ServiceDeps;
let duplicateDashboard: typeof import('./dashboard.service').duplicateDashboard;

function loadDashboard(id: string) {
  return deps.db.dashboard.findUniqueOrThrow({
    where: { id },
    include: {
      share: true,
      reports: { include: { layout: true }, orderBy: { name: 'asc' } },
    },
  });
}

type LoadedDashboard = Awaited<ReturnType<typeof loadDashboard>>;
type LoadedReport = LoadedDashboard['reports'][number];

function withoutIdentity({
  id: _id,
  dashboardId: _dashboardId,
  createdAt: _createdAt,
  updatedAt: _updatedAt,
  layout,
  ...report
}: LoadedReport) {
  if (!layout) {
    return { ...report, layout };
  }
  const {
    id: _layoutId,
    reportId: _reportId,
    createdAt: _layoutCreatedAt,
    updatedAt: _layoutUpdatedAt,
    ...position
  } = layout;
  return { ...report, layout: position };
}

let original: LoadedDashboard;

beforeAll(async () => {
  const { bootstrapTestDatabases } = await import(
    '../../../../../test/bootstrap-databases'
  );
  await bootstrapTestDatabases();
  const { testServiceDeps } = await import('../../../test/service-deps');
  deps = await testServiceDeps();
  ({ duplicateDashboard } = await import('./dashboard.service'));

  await deps.db.dashboard.deleteMany({ where: { projectId: PROJECT_ID } });
  await deps.db.organization.upsert({
    where: { id: ORGANIZATION_ID },
    create: { id: ORGANIZATION_ID, name: 'Duplicate org', timezone: 'UTC' },
    update: {},
  });
  await deps.db.project.upsert({
    where: { id: PROJECT_ID },
    create: {
      id: PROJECT_ID,
      name: 'Duplicate',
      organizationId: ORGANIZATION_ID,
    },
    update: {},
  });
  await deps.db.dashboard.create({
    data: {
      id: DASHBOARD_ID,
      name: 'Growth',
      projectId: PROJECT_ID,
      organizationId: ORGANIZATION_ID,
      share: {
        create: {
          id: 'dashboard-duplicate-share',
          organizationId: ORGANIZATION_ID,
          projectId: PROJECT_ID,
          public: true,
        },
      },
      reports: {
        create: [
          {
            name: 'A: signups',
            projectId: PROJECT_ID,
            interval: 'day',
            range: '7d',
            chartType: 'bar',
            events: [{ id: 'A', type: 'event', name: 'sign_up' }],
            breakdowns: [{ id: 'b1', name: 'country' }],
            globalFilters: [
              {
                id: 'g1',
                name: 'path',
                operator: 'is',
                value: ['/pricing'],
              },
            ],
            formula: 'A*2',
            previous: true,
            metric: 'average',
            options: { type: 'funnel', funnelGroup: 'session' },
            display: { view: 'table' },
            visibleSeries: ['A'],
            layout: {
              create: { gridColumns: 24, x: 12, y: 6, w: 12, h: 9, minW: 6 },
            },
          },
          {
            name: 'B: no layout',
            projectId: PROJECT_ID,
            interval: 'hour',
            chartType: 'linear',
            events: [],
            breakdowns: [],
            visibleSeries: [],
          },
        ],
      },
    },
  });
  original = await loadDashboard(DASHBOARD_ID);
});

afterAll(async () => {
  await deps.db.dashboard.deleteMany({ where: { projectId: PROJECT_ID } });
  await deps.db.project.deleteMany({ where: { id: PROJECT_ID } });
  await deps.db.organization.deleteMany({ where: { id: ORGANIZATION_ID } });
});

test('copies every report with its tile layout into a new dashboard', async () => {
  const created = await duplicateDashboard(deps, DASHBOARD_ID);
  const copy = await loadDashboard(created.id);

  expect(copy.id).not.toBe(DASHBOARD_ID);
  expect(copy.name).toBe('Copy of Growth');
  expect(copy.projectId).toBe(PROJECT_ID);
  expect(copy.organizationId).toBe(ORGANIZATION_ID);
  expect(copy.reports.map(withoutIdentity)).toEqual(
    original.reports.map(withoutIdentity)
  );

  const originalReportIds = new Set(original.reports.map((r) => r.id));
  for (const report of copy.reports) {
    expect(originalReportIds.has(report.id)).toBe(false);
    expect(report.dashboardId).toBe(copy.id);
  }
  const [withLayout, withoutLayout] = copy.reports;
  expect(withLayout?.layout?.id).not.toBe(original.reports[0]?.layout?.id);
  expect(withoutLayout?.layout).toBeNull();
});

test('does not copy the share link', async () => {
  const created = await duplicateDashboard(deps, DASHBOARD_ID);
  const copy = await loadDashboard(created.id);

  expect(original.share).not.toBeNull();
  expect(copy.share).toBeNull();
});

test('leaves the original untouched, also when the copy is edited', async () => {
  const created = await duplicateDashboard(deps, DASHBOARD_ID);
  const copy = await loadDashboard(created.id);
  const [copiedReport] = copy.reports;
  if (!copiedReport) {
    throw new Error('copy has no reports');
  }
  await deps.db.report.update({
    where: { id: copiedReport.id },
    data: { name: 'Renamed', layout: { update: { x: 0, y: 0 } } },
  });

  expect(await loadDashboard(DASHBOARD_ID)).toEqual(original);
});

test('a second copy of the same dashboard gets its own id', async () => {
  const first = await duplicateDashboard(deps, DASHBOARD_ID);
  const second = await duplicateDashboard(deps, DASHBOARD_ID);

  expect(second.id).not.toBe(first.id);
  expect(second.name).toBe(first.name);
});
