import { describe, expect, it } from 'vitest';
import { execute, validate } from './index';

describe('validate', () => {
  describe('Valid templates', () => {
    it('should accept arrow function', () => {
      const result = validate('(payload) => ({ event: payload.name })');
      expect(result.valid).toBe(true);
    });

    it('should reject function expression', () => {
      // Function expressions are not allowed - only arrow functions
      const result = validate(
        '(function(payload) { return { event: payload.name }; })',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('arrow functions');
    });

    it('should accept complex transformations', () => {
      const code = `(payload) => ({
        event: payload.name,
        user: payload.profileId,
        data: payload.properties,
        timestamp: new Date(payload.createdAt).toISOString()
      })`;
      const result = validate(code);
      expect(result.valid).toBe(true);
    });

    it('should accept array operations', () => {
      const code = `(payload) => ({
        tags: payload.tags?.map(t => t.toUpperCase()) || []
      })`;
      const result = validate(code);
      expect(result.valid).toBe(true);
    });
  });

  describe('Blocked operations', () => {
    it('should block fetch calls', () => {
      const result = validate('(payload) => fetch("https://evil.com")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('fetch');
    });

    it('should block XMLHttpRequest', () => {
      const result = validate('(payload) => new XMLHttpRequest()');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('XMLHttpRequest');
    });

    it('should block require calls', () => {
      const result = validate('(payload) => require("fs")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('require');
    });

    it('should block import statements', () => {
      const result = validate('import fs from "fs"; (payload) => ({})');
      expect(result.valid).toBe(false);
      // Import statements cause multiple statements error first
      expect(result.error).toContain('single function');
    });

    it('should block eval calls', () => {
      const result = validate('(payload) => eval("evil")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('eval');
    });

    it('should block setTimeout', () => {
      const result = validate('(payload) => setTimeout(() => {}, 1000)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('setTimeout');
    });

    it('should block process access', () => {
      const result = validate('(payload) => process.env.SECRET');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('process');
    });

    it('should block while loops', () => {
      const result = validate(
        '(payload) => { while(true) {} return payload; }',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Loops are not allowed');
    });

    it('should block for loops', () => {
      const result = validate(
        '(payload) => { for(let i = 0; i < 10; i++) {} return payload; }',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Loops are not allowed');
    });

    it('should block try/catch', () => {
      const result = validate(
        '(payload) => { try { return payload; } catch(e) {} }',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('try/catch');
    });

    it('should block async/await', () => {
      const result = validate(
        'async (payload) => { await something(); return payload; }',
      );
      expect(result.valid).toBe(false);
      expect(result.error).toContain('async/await');
    });

    it('should block classes', () => {
      const result = validate('(payload) => { class Foo {} return payload; }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Class');
    });

    it('should block new Array()', () => {
      const result = validate('(payload) => new Array(10)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('new Array()');
    });

    it('should block new Object()', () => {
      const result = validate('(payload) => new Object()');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('new Object()');
    });

    it('should allow new Date()', () => {
      const result = validate(
        '(payload) => ({ timestamp: new Date().toISOString() })',
      );
      expect(result.valid).toBe(true);
    });
  });

  describe('Invalid syntax', () => {
    it('should reject non-function code', () => {
      const result = validate('const x = 1;');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('function');
    });

    it('should reject invalid JavaScript', () => {
      const result = validate('(payload) => { invalid syntax }');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Parse error');
    });
  });
});

describe('execute', () => {
  const basePayload = {
    name: 'page_view',
    profileId: 'user-123',
    country: 'US',
    city: 'New York',
    device: 'desktop',
    os: 'Windows',
    browser: 'Chrome',
    longitude: -73.935242,
    latitude: 40.73061,
    createdAt: '2024-01-15T10:30:00Z',
    properties: {
      plan: 'premium',
      userId: 'user-456',
      metadata: {
        source: 'web',
        campaign: 'summer-sale',
      },
    },
    profile: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
    },
    tags: ['tag1', 'tag2'],
  };

  describe('Basic transformations', () => {
    it('should execute simple arrow function', () => {
      const code = '(payload) => ({ event: payload.name })';
      const result = execute(code, basePayload);
      expect(result).toEqual({ event: 'page_view' });
    });

    it('should access nested properties', () => {
      const code = '(payload) => ({ plan: payload.properties.plan })';
      const result = execute(code, basePayload);
      expect(result).toEqual({ plan: 'premium' });
    });

    it('should handle multiple properties', () => {
      const code = `(payload) => ({
        event: payload.name,
        user: payload.profileId,
        location: payload.city
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({
        event: 'page_view',
        user: 'user-123',
        location: 'New York',
      });
    });
  });

  describe('Date operations', () => {
    it('should format dates', () => {
      const code = `(payload) => ({
        timestamp: new Date(payload.createdAt).toISOString()
      })`;
      const result = execute(code, basePayload);
      expect(result).toHaveProperty('timestamp');
      expect((result as { timestamp: string }).timestamp).toBe(
        '2024-01-15T10:30:00.000Z',
      );
    });
  });

  describe('Array operations', () => {
    it('should transform arrays', () => {
      const code = `(payload) => ({
        tags: payload.tags?.map(t => t.toUpperCase()) || []
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ tags: ['TAG1', 'TAG2'] });
    });

    it('should filter arrays', () => {
      const code = `(payload) => ({
        filtered: payload.tags?.filter(t => t.includes('tag1')) || []
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ filtered: ['tag1'] });
    });
  });

  describe('String operations', () => {
    it('should use template literals', () => {
      const code = `(payload) => ({
        location: \`\${payload.city}, \${payload.country}\`
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ location: 'New York, US' });
    });

    it('should use string methods', () => {
      const code = `(payload) => ({
        upperName: payload.name.toUpperCase()
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ upperName: 'PAGE_VIEW' });
    });
  });

  describe('Math operations', () => {
    it('should use Math functions', () => {
      const code = `(payload) => ({
        roundedLng: Math.round(payload.longitude)
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ roundedLng: -74 });
    });
  });

  describe('Conditional logic', () => {
    it('should handle ternary operators', () => {
      const code = `(payload) => ({
        plan: payload.properties?.plan || 'free'
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ plan: 'premium' });
    });

    it('should handle if conditions', () => {
      const code = `(payload) => {
        const result = { event: payload.name };
        if (payload.properties?.plan === 'premium') {
          result.plan = 'premium';
        }
        return result;
      }`;
      const result = execute(code, basePayload);
      expect(result).toEqual({ event: 'page_view', plan: 'premium' });
    });
  });

  describe('Complex transformations', () => {
    it('should handle nested object construction', () => {
      const code = `(payload) => ({
        event: payload.name,
        user: {
          id: payload.profileId,
          name: \`\${payload.profile?.firstName} \${payload.profile?.lastName}\`
        },
        data: payload.properties,
        meta: {
          location: \`\${payload.city}, \${payload.country}\`,
          device: payload.device
        }
      })`;
      const result = execute(code, basePayload);
      expect(result).toEqual({
        event: 'page_view',
        user: {
          id: 'user-123',
          name: 'John Doe',
        },
        data: basePayload.properties,
        meta: {
          location: 'New York, US',
          device: 'desktop',
        },
      });
    });
  });

  describe('Error handling', () => {
    it('should handle runtime errors gracefully', () => {
      const code = '(payload) => payload.nonexistent.property';
      expect(() => {
        execute(code, basePayload);
      }).toThrow('Error executing JavaScript template');
    });
  });
});
