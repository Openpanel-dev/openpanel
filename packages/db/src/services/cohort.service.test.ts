import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CohortDefinition,
  EventBasedCohortDefinition,
  PropertyBasedCohortDefinition,
} from '@openpanel/validation';
import { ch } from '../clickhouse/client';
import { db } from '../prisma-client';
import {
  computeCohort,
  computeEventBasedCohort,
  computePropertyBasedCohort,
  getCohortCount,
  getCohortMembers,
  storeCohortMembership,
  updateCohortMembership,
} from './cohort.service';

// Mock the ch and db modules
vi.mock('../clickhouse/client', () => ({
  ch: vi.fn(),
  chQuery: vi.fn(),
  TABLE_NAMES: {
    events: 'events',
    profiles: 'profiles',
    cohort_members: 'cohort_members',
    cohort_metadata: 'cohort_metadata',
    profile_event_summary_mv: 'profile_event_summary_mv',
  },
}));

vi.mock('../prisma-client', () => ({
  db: {
    cohort: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const mockChQuery = vi.fn();
vi.mock('../clickhouse/client', async () => {
  const actual = await vi.importActual('../clickhouse/client');
  return {
    ...actual,
    chQuery: mockChQuery,
  };
});

describe('Cohort Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('computeEventBasedCohort', () => {
    it('should compute cohort with single event criteria (OR)', async () => {
      const definition: EventBasedCohortDefinition = {
        type: 'event',
        criteria: {
          events: [
            {
              name: 'page_view',
              filters: [],
              timeframe: { type: 'relative', value: '30d' },
              frequency: { operator: 'gte', value: 1 },
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([
        { profile_id: 'user1' },
        { profile_id: 'user2' },
      ]);

      const result = await computeEventBasedCohort('project-123', definition);

      expect(result).toEqual(['user1', 'user2']);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });

    it('should compute cohort with multiple event criteria (AND)', async () => {
      const definition: EventBasedCohortDefinition = {
        type: 'event',
        criteria: {
          events: [
            {
              name: 'signup',
              filters: [],
              timeframe: { type: 'relative', value: '30d' },
            },
            {
              name: 'purchase',
              filters: [],
              timeframe: { type: 'relative', value: '7d' },
              frequency: { operator: 'gte', value: 1 },
            },
          ],
          operator: 'and',
        },
      };

      mockChQuery.mockResolvedValueOnce([
        { profile_id: 'user1' },
        { profile_id: 'user2' },
      ]);

      const result = await computeEventBasedCohort('project-123', definition);

      expect(result).toEqual(['user1', 'user2']);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
      // Verify INTERSECT is used for AND
      const query = mockChQuery.mock.calls[0][0];
      expect(query).toContain('INTERSECT');
    });

    it('should handle event criteria with filters', async () => {
      const definition: EventBasedCohortDefinition = {
        type: 'event',
        criteria: {
          events: [
            {
              name: 'page_view',
              filters: [
                {
                  id: 'f1',
                  name: 'path',
                  operator: 'is',
                  value: ['/pricing'],
                },
              ],
              timeframe: { type: 'relative', value: '7d' },
              frequency: { operator: 'gte', value: 3 },
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user1' }]);

      const result = await computeEventBasedCohort('project-123', definition);

      expect(result).toEqual(['user1']);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });

    it('should handle absolute timeframe', async () => {
      const definition: EventBasedCohortDefinition = {
        type: 'event',
        criteria: {
          events: [
            {
              name: 'signup',
              filters: [],
              timeframe: { type: 'absolute', value: '2024-01-01' },
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user1' }]);

      const result = await computeEventBasedCohort('project-123', definition);

      expect(result).toEqual(['user1']);
      const query = mockChQuery.mock.calls[0][0];
      expect(query).toContain('2024-01-01');
    });
  });

  describe('computePropertyBasedCohort', () => {
    it('should compute cohort with single property (OR)', async () => {
      const definition: PropertyBasedCohortDefinition = {
        type: 'property',
        criteria: {
          properties: [
            {
              id: 'p1',
              name: 'email',
              operator: 'isSet',
              value: [],
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([
        { profile_id: 'user1' },
        { profile_id: 'user2' },
      ]);

      const result = await computePropertyBasedCohort(
        'project-123',
        definition,
      );

      expect(result).toEqual(['user1', 'user2']);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });

    it('should compute cohort with multiple properties (AND)', async () => {
      const definition: PropertyBasedCohortDefinition = {
        type: 'property',
        criteria: {
          properties: [
            {
              id: 'p1',
              name: 'plan',
              operator: 'is',
              value: ['premium'],
            },
            {
              id: 'p2',
              name: 'country',
              operator: 'is',
              value: ['US'],
            },
          ],
          operator: 'and',
        },
      };

      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user1' }]);

      const result = await computePropertyBasedCohort(
        'project-123',
        definition,
      );

      expect(result).toEqual(['user1']);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('computeCohort', () => {
    it('should route to event-based computation', async () => {
      const definition: CohortDefinition = {
        type: 'event',
        criteria: {
          events: [
            {
              name: 'login',
              filters: [],
              timeframe: { type: 'relative', value: '7d' },
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user1' }]);

      const result = await computeCohort('project-123', definition);

      expect(result).toEqual(['user1']);
    });

    it('should route to property-based computation', async () => {
      const definition: CohortDefinition = {
        type: 'property',
        criteria: {
          properties: [
            {
              id: 'p1',
              name: 'email',
              operator: 'isSet',
              value: [],
            },
          ],
          operator: 'or',
        },
      };

      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user1' }]);

      const result = await computeCohort('project-123', definition);

      expect(result).toEqual(['user1']);
    });
  });

  describe('storeCohortMembership', () => {
    it('should store cohort members in ClickHouse', async () => {
      mockChQuery.mockResolvedValueOnce(undefined);

      await storeCohortMembership(
        'cohort-123',
        'project-123',
        ['user1', 'user2', 'user3'],
      );

      expect(mockChQuery).toHaveBeenCalledTimes(1);
      const query = mockChQuery.mock.calls[0][0];
      expect(query).toContain('cohort_members');
      expect(query).toContain('cohort-123');
      expect(query).toContain('project-123');
    });

    it('should handle empty profile list', async () => {
      mockChQuery.mockResolvedValueOnce(undefined);

      await storeCohortMembership('cohort-123', 'project-123', []);

      // Should still execute to clear old members
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });
  });

  describe('getCohortMembers', () => {
    it('should retrieve cohort members with pagination', async () => {
      mockChQuery.mockResolvedValueOnce([
        { profile_id: 'user1' },
        { profile_id: 'user2' },
      ]);
      mockChQuery.mockResolvedValueOnce([{ count: 100 }]);

      const result = await getCohortMembers('cohort-123', 'project-123', {
        limit: 50,
        offset: 0,
      });

      expect(result.profileIds).toEqual(['user1', 'user2']);
      expect(result.total).toBe(100);
      expect(mockChQuery).toHaveBeenCalledTimes(2);
    });

    it('should respect pagination offset', async () => {
      mockChQuery.mockResolvedValueOnce([{ profile_id: 'user51' }]);
      mockChQuery.mockResolvedValueOnce([{ count: 100 }]);

      const result = await getCohortMembers('cohort-123', 'project-123', {
        limit: 1,
        offset: 50,
      });

      expect(result.profileIds).toEqual(['user51']);
      expect(result.total).toBe(100);
    });
  });

  describe('getCohortCount', () => {
    it('should return cached count if available', async () => {
      mockChQuery.mockResolvedValueOnce([
        {
          member_count: 150,
          computed_at: new Date(),
        },
      ]);

      const count = await getCohortCount('cohort-123', 'project-123');

      expect(count).toBe(150);
      expect(mockChQuery).toHaveBeenCalledTimes(1);
    });

    it('should return 0 if no metadata found', async () => {
      mockChQuery.mockResolvedValueOnce([]);

      const count = await getCohortCount('cohort-123', 'project-123');

      expect(count).toBe(0);
    });
  });

  describe('updateCohortMembership', () => {
    it('should recompute and store cohort membership', async () => {
      const mockCohort = {
        id: 'cohort-123',
        projectId: 'project-123',
        definition: {
          type: 'event',
          criteria: {
            events: [
              {
                name: 'login',
                filters: [],
                timeframe: { type: 'relative', value: '7d' },
              },
            ],
            operator: 'or',
          },
        } as CohortDefinition,
      };

      vi.mocked(db.cohort.findUnique).mockResolvedValueOnce(mockCohort as any);
      mockChQuery.mockResolvedValueOnce([
        { profile_id: 'user1' },
        { profile_id: 'user2' },
      ]);
      mockChQuery.mockResolvedValueOnce(undefined); // store
      mockChQuery.mockResolvedValueOnce(undefined); // metadata
      vi.mocked(db.cohort.update).mockResolvedValueOnce(mockCohort as any);

      await updateCohortMembership('cohort-123');

      expect(db.cohort.findUnique).toHaveBeenCalledWith({
        where: { id: 'cohort-123' },
      });
      expect(db.cohort.update).toHaveBeenCalledWith({
        where: { id: 'cohort-123' },
        data: expect.objectContaining({
          profileCount: 2,
          lastComputedAt: expect.any(Date),
        }),
      });
    });

    it('should throw error if cohort not found', async () => {
      vi.mocked(db.cohort.findUnique).mockResolvedValueOnce(null);

      await expect(updateCohortMembership('nonexistent')).rejects.toThrow(
        'Cohort not found',
      );
    });
  });
});
