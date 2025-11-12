import type { IChartEvent, IChartInput } from '@openpanel/validation';
import { describe, expect, it } from 'vitest';
import { withFormula } from './chart.helpers';

// Helper to create a test event
function createEvent(
  id: string,
  name: string,
  displayName?: string,
): IChartEvent {
  return {
    id,
    name,
    displayName: displayName ?? '',
    segment: 'event',
    filters: [],
  };
}

const createChartInput = (
  rest: Pick<IChartInput, 'events' | 'formula'>,
): IChartInput => {
  return {
    metric: 'sum',
    chartType: 'linear',
    interval: 'day',
    breakdowns: [],
    projectId: '1',
    startDate: '2025-01-01',
    endDate: '2025-01-01',
    range: '30d',
    previous: false,
    formula: '',
    ...rest,
  };
};

// Helper to create a test series
function createSeries(
  name: string[],
  event: IChartEvent,
  data: Array<{ date: string; count: number }>,
) {
  return {
    name,
    event,
    data: data.map((d) => ({ ...d, total_count: d.count })),
  };
}

describe('withFormula', () => {
  describe('edge cases', () => {
    it('should return series unchanged when formula is empty', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: '', events }),
        series,
      );

      expect(result).toEqual(series);
    });

    it('should return series unchanged when series is empty', () => {
      const events = [createEvent('evt1', 'event1')];
      const result = withFormula(
        createChartInput({ formula: 'A*100', events }),
        [],
      );

      expect(result).toEqual([]);
    });

    it('should return series unchanged when series has no data', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [{ name: ['event1'], event: events[0]!, data: [] }];

      const result = withFormula(
        createChartInput({ formula: 'A*100', events }),
        series,
      );

      expect(result).toEqual(series);
    });
  });

  describe('single event, no breakdown', () => {
    it('should apply simple multiplication formula', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
          { date: '2025-01-02', count: 20 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A*100', events }),
        series,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.data).toEqual([
        { date: '2025-01-01', count: 1000, total_count: 10 },
        { date: '2025-01-02', count: 2000, total_count: 20 },
      ]);
    });

    it('should apply addition formula', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 5 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A+10', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(15);
    });

    it('should handle division formula', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 100 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/10', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(10);
    });

    it('should handle NaN and Infinity by returning 0', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 0 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/0', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(0);
    });
  });

  describe('single event, with breakdown', () => {
    it('should apply formula to each breakdown group', () => {
      const events = [createEvent('evt1', 'screen_view')];
      const series = [
        createSeries(['iOS'], events[0]!, [{ date: '2025-01-01', count: 10 }]),
        createSeries(['Android'], events[0]!, [
          { date: '2025-01-01', count: 20 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A*100', events }),
        series,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toEqual(['iOS']);
      expect(result[0]?.data[0]?.count).toBe(1000);
      expect(result[1]?.name).toEqual(['Android']);
      expect(result[1]?.data[0]?.count).toBe(2000);
    });

    it('should handle multiple breakdown values', () => {
      const events = [createEvent('evt1', 'screen_view')];
      const series = [
        createSeries(['iOS', 'US'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
        createSeries(['Android', 'US'], events[0]!, [
          { date: '2025-01-01', count: 20 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A*2', events }),
        series,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toEqual(['iOS', 'US']);
      expect(result[0]?.data[0]?.count).toBe(20);
      expect(result[1]?.name).toEqual(['Android', 'US']);
      expect(result[1]?.data[0]?.count).toBe(40);
    });
  });

  describe('multiple events, no breakdown', () => {
    it('should combine two events with division formula', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'session_start'),
      ];
      const series = [
        createSeries(['screen_view'], events[0]!, [
          { date: '2025-01-01', count: 100 },
        ]),
        createSeries(['session_start'], events[1]!, [
          { date: '2025-01-01', count: 50 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.data[0]?.count).toBe(2);
    });

    it('should combine two events with addition formula', () => {
      const events = [
        createEvent('evt1', 'event1'),
        createEvent('evt2', 'event2'),
      ];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
        createSeries(['event2'], events[1]!, [
          { date: '2025-01-01', count: 20 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A+B', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(30);
    });

    it('should handle three events', () => {
      const events = [
        createEvent('evt1', 'event1'),
        createEvent('evt2', 'event2'),
        createEvent('evt3', 'event3'),
      ];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
        createSeries(['event2'], events[1]!, [
          { date: '2025-01-01', count: 20 },
        ]),
        createSeries(['event3'], events[2]!, [
          { date: '2025-01-01', count: 30 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A+B+C', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(60);
    });

    it('should handle missing data points with 0', () => {
      const events = [
        createEvent('evt1', 'event1'),
        createEvent('evt2', 'event2'),
      ];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
          { date: '2025-01-02', count: 20 },
        ]),
        createSeries(['event2'], events[1]!, [
          { date: '2025-01-01', count: 5 },
          // Missing 2025-01-02
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A+B', events }),
        series,
      );

      expect(result[0]?.data[0]?.count).toBe(15); // 10 + 5
      expect(result[0]?.data[1]?.count).toBe(20); // 20 + 0 (missing)
    });
  });

  describe('multiple events, with breakdown', () => {
    it('should match series by breakdown values and apply formula', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'session_start'),
      ];
      const series = [
        // iOS breakdown
        createSeries(['iOS'], events[0]!, [{ date: '2025-01-01', count: 100 }]),
        createSeries(['iOS'], events[1]!, [{ date: '2025-01-01', count: 50 }]),
        // Android breakdown
        createSeries(['Android'], events[0]!, [
          { date: '2025-01-01', count: 200 },
        ]),
        createSeries(['Android'], events[1]!, [
          { date: '2025-01-01', count: 100 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      expect(result).toHaveLength(2);
      // iOS: 100/50 = 2
      expect(result[0]?.name).toEqual(['iOS']);
      expect(result[0]?.data[0]?.count).toBe(2);
      // Android: 200/100 = 2
      expect(result[1]?.name).toEqual(['Android']);
      expect(result[1]?.data[0]?.count).toBe(2);
    });

    it('should handle multiple breakdown values matching', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'session_start'),
      ];
      const series = [
        createSeries(['iOS', 'US'], events[0]!, [
          { date: '2025-01-01', count: 100 },
        ]),
        createSeries(['iOS', 'US'], events[1]!, [
          { date: '2025-01-01', count: 50 },
        ]),
        createSeries(['Android', 'US'], events[0]!, [
          { date: '2025-01-01', count: 200 },
        ]),
        createSeries(['Android', 'US'], events[1]!, [
          { date: '2025-01-01', count: 100 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.name).toEqual(['iOS', 'US']);
      expect(result[0]?.data[0]?.count).toBe(2);
      expect(result[1]?.name).toEqual(['Android', 'US']);
      expect(result[1]?.data[0]?.count).toBe(2);
    });

    it('should handle different date ranges across breakdown groups', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'session_start'),
      ];
      const series = [
        createSeries(['iOS'], events[0]!, [
          { date: '2025-01-01', count: 100 },
          { date: '2025-01-02', count: 200 },
        ]),
        createSeries(['iOS'], events[1]!, [
          { date: '2025-01-01', count: 50 },
          { date: '2025-01-02', count: 100 },
        ]),
        createSeries(['Android'], events[0]!, [
          { date: '2025-01-01', count: 300 },
          // Missing 2025-01-02
        ]),
        createSeries(['Android'], events[1]!, [
          { date: '2025-01-01', count: 150 },
          { date: '2025-01-02', count: 200 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      expect(result).toHaveLength(2);
      // iOS group
      expect(result[0]?.name).toEqual(['iOS']);
      expect(result[0]?.data[0]?.count).toBe(2); // 100/50
      expect(result[0]?.data[1]?.count).toBe(2); // 200/100
      // Android group
      expect(result[1]?.name).toEqual(['Android']);
      expect(result[1]?.data[0]?.count).toBe(2); // 300/150
      expect(result[1]?.data[1]?.count).toBe(0); // 0/200 = 0 (missing A)
    });
  });

  describe('complex formulas', () => {
    it('should handle complex expressions', () => {
      const events = [
        createEvent('evt1', 'event1'),
        createEvent('evt2', 'event2'),
        createEvent('evt3', 'event3'),
      ];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
        createSeries(['event2'], events[1]!, [
          { date: '2025-01-01', count: 20 },
        ]),
        createSeries(['event3'], events[2]!, [
          { date: '2025-01-01', count: 30 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: '(A+B)*C', events }),
        series,
      );

      // (10+20)*30 = 900
      expect(result[0]?.data[0]?.count).toBe(900);
    });

    it('should handle percentage calculations', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'session_start'),
      ];
      const series = [
        createSeries(['screen_view'], events[0]!, [
          { date: '2025-01-01', count: 75 },
        ]),
        createSeries(['session_start'], events[1]!, [
          { date: '2025-01-01', count: 100 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: '(A/B)*100', events }),
        series,
      );

      // (75/100)*100 = 75
      expect(result[0]?.data[0]?.count).toBe(75);
    });
  });

  describe('error handling', () => {
    it('should handle invalid formulas gracefully', () => {
      const events = [createEvent('evt1', 'event1')];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'invalid formula', events }),
        series,
      );

      // Should return 0 for invalid formulas
      expect(result[0]?.data[0]?.count).toBe(0);
    });

    it('should handle division by zero', () => {
      const events = [
        createEvent('evt1', 'event1'),
        createEvent('evt2', 'event2'),
      ];
      const series = [
        createSeries(['event1'], events[0]!, [
          { date: '2025-01-01', count: 10 },
        ]),
        createSeries(['event2'], events[1]!, [
          { date: '2025-01-01', count: 0 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      // Division by zero should result in 0 (Infinity -> 0)
      expect(result[0]?.data[0]?.count).toBe(0);
    });
  });

  describe('real-world scenario: article hit ratio', () => {
    it('should calculate hit ratio per article path', () => {
      const events = [
        createEvent('evt1', 'screen_view'),
        createEvent('evt2', 'article_card_seen'),
      ];
      const series = [
        // Article 1
        createSeries(['/articles/1'], events[0]!, [
          { date: '2025-01-01', count: 1000 },
        ]),
        createSeries(['/articles/1'], events[1]!, [
          { date: '2025-01-01', count: 100 },
        ]),
        // Article 2
        createSeries(['/articles/2'], events[0]!, [
          { date: '2025-01-01', count: 500 },
        ]),
        createSeries(['/articles/2'], events[1]!, [
          { date: '2025-01-01', count: 200 },
        ]),
      ];

      const result = withFormula(
        createChartInput({ formula: 'A/B', events }),
        series,
      );

      expect(result).toHaveLength(2);
      // Article 1: 1000/100 = 10
      expect(result[0]?.name).toEqual(['/articles/1']);
      expect(result[0]?.data[0]?.count).toBe(10);
      // Article 2: 500/200 = 2.5
      expect(result[1]?.name).toEqual(['/articles/2']);
      expect(result[1]?.data[0]?.count).toBe(2.5);
    });
  });
});
