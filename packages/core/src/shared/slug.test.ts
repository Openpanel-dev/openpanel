import { describe, expect, it } from 'bun:test';
import { slug } from './slug';

describe('slug', () => {
  it('should remove pipes from string', () => {
    expect(slug('Hello || World, | Test å å ä ä')).toBe(
      'hello-world-test-a-a-a-a'
    );
  });
});
