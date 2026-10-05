// Tests @openpanel/shared's slug helper from here because the root `test` script
// does not run packages/shared.
import { describe, expect, it } from 'bun:test';
import { slug } from '@openpanel/shared';

describe('slug', () => {
  it('should remove pipes from string', () => {
    expect(slug('Hello || World, | Test å å ä ä')).toBe(
      'hello-world-test-a-a-a-a'
    );
  });
});
