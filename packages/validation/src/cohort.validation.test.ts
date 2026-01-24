import { describe, expect, it } from 'vitest';
import {
  zCohortDefinition,
  zCohortInput,
  zCohortUpdate,
  zEventCriteria,
  zFrequency,
  zTimeframe,
} from './cohort.validation';

describe('Cohort Validation', () => {
  describe('zTimeframe', () => {
    it('should validate relative timeframe', () => {
      const result = zTimeframe.safeParse({
        type: 'relative',
        value: '30d',
      });
      expect(result.success).toBe(true);
    });

    it('should validate absolute timeframe', () => {
      const result = zTimeframe.safeParse({
        type: 'absolute',
        value: '2024-01-01',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid timeframe type', () => {
      const result = zTimeframe.safeParse({
        type: 'invalid',
        value: '30d',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('zFrequency', () => {
    it('should validate gte operator', () => {
      const result = zFrequency.safeParse({
        operator: 'gte',
        value: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should validate eq operator', () => {
      const result = zFrequency.safeParse({
        operator: 'eq',
        value: 1,
      });
      expect(result.success).toBe(true);
    });

    it('should validate lte operator', () => {
      const result = zFrequency.safeParse({
        operator: 'lte',
        value: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative values', () => {
      const result = zFrequency.safeParse({
        operator: 'gte',
        value: -1,
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid operator', () => {
      const result = zFrequency.safeParse({
        operator: 'invalid',
        value: 5,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('zEventCriteria', () => {
    it('should validate basic event criteria', () => {
      const result = zEventCriteria.safeParse({
        name: 'page_view',
        filters: [],
        timeframe: { type: 'relative', value: '30d' },
      });
      expect(result.success).toBe(true);
    });

    it('should validate event criteria with frequency', () => {
      const result = zEventCriteria.safeParse({
        name: 'purchase',
        filters: [],
        timeframe: { type: 'relative', value: '7d' },
        frequency: { operator: 'gte', value: 3 },
      });
      expect(result.success).toBe(true);
    });

    it('should validate event criteria with filters', () => {
      const result = zEventCriteria.safeParse({
        name: 'click',
        filters: [
          {
            id: 'filter1',
            name: 'button_name',
            operator: 'is',
            value: ['submit'],
          },
        ],
        timeframe: { type: 'absolute', value: '2024-01-01' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty event name', () => {
      const result = zEventCriteria.safeParse({
        name: '',
        filters: [],
        timeframe: { type: 'relative', value: '30d' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('zCohortDefinition - Event-based', () => {
    it('should validate event-based cohort with OR operator', () => {
      const result = zCohortDefinition.safeParse({
        type: 'event',
        criteria: {
          events: [
            {
              name: 'signup',
              filters: [],
              timeframe: { type: 'relative', value: '30d' },
              frequency: { operator: 'gte', value: 1 },
            },
          ],
          operator: 'or',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should validate event-based cohort with AND operator', () => {
      const result = zCohortDefinition.safeParse({
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
      });
      expect(result.success).toBe(true);
    });

    it('should validate event-based cohort with multiple events and filters', () => {
      const result = zCohortDefinition.safeParse({
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
              frequency: { operator: 'gte', value: 5 },
            },
            {
              name: 'click',
              filters: [
                {
                  id: 'f2',
                  name: 'element',
                  operator: 'is',
                  value: ['button'],
                },
              ],
              timeframe: { type: 'relative', value: '7d' },
            },
          ],
          operator: 'or',
        },
      });
      expect(result.success).toBe(true);
    });
  });

  describe('zCohortDefinition - Property-based', () => {
    it('should validate property-based cohort with single property', () => {
      const result = zCohortDefinition.safeParse({
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
      });
      expect(result.success).toBe(true);
    });

    it('should validate property-based cohort with multiple properties', () => {
      const result = zCohortDefinition.safeParse({
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
      });
      expect(result.success).toBe(true);
    });
  });

  describe('zCohortInput', () => {
    it('should validate complete cohort input', () => {
      const result = zCohortInput.safeParse({
        name: 'Active Users',
        description: 'Users who logged in recently',
        projectId: 'proj-123',
        definition: {
          type: 'event',
          criteria: {
            events: [
              {
                name: 'login',
                filters: [],
                timeframe: { type: 'relative', value: '7d' },
                frequency: { operator: 'gte', value: 1 },
              },
            ],
            operator: 'or',
          },
        },
        isStatic: false,
        computeOnDemand: false,
      });
      expect(result.success).toBe(true);
    });

    it('should validate cohort input with defaults', () => {
      const result = zCohortInput.safeParse({
        name: 'Test Cohort',
        projectId: 'proj-123',
        definition: {
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
        },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isStatic).toBe(false);
        expect(result.data.computeOnDemand).toBe(false);
      }
    });

    it('should reject cohort without name', () => {
      const result = zCohortInput.safeParse({
        projectId: 'proj-123',
        definition: {
          type: 'event',
          criteria: {
            events: [],
            operator: 'or',
          },
        },
      });
      expect(result.success).toBe(false);
    });

    it('should reject cohort without projectId', () => {
      const result = zCohortInput.safeParse({
        name: 'Test',
        definition: {
          type: 'event',
          criteria: {
            events: [],
            operator: 'or',
          },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('zCohortUpdate', () => {
    it('should validate cohort update with all fields', () => {
      const result = zCohortUpdate.safeParse({
        id: 'cohort-123',
        name: 'Updated Name',
        description: 'Updated description',
        definition: {
          type: 'event',
          criteria: {
            events: [
              {
                name: 'signup',
                filters: [],
                timeframe: { type: 'relative', value: '30d' },
              },
            ],
            operator: 'or',
          },
        },
        isStatic: true,
        computeOnDemand: false,
      });
      expect(result.success).toBe(true);
    });

    it('should validate cohort update with partial fields', () => {
      const result = zCohortUpdate.safeParse({
        id: 'cohort-123',
        name: 'New Name',
      });
      expect(result.success).toBe(true);
    });

    it('should reject update without id', () => {
      const result = zCohortUpdate.safeParse({
        name: 'New Name',
      });
      expect(result.success).toBe(false);
    });
  });
});
