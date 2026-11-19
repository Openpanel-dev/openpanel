import { describe, expect, it } from 'bun:test';
import { hostnameFromInput } from './hostname';

describe('hostnameFromInput', () => {
  it('reduces URLs and bare hosts to a lower-cased hostname', () => {
    expect(hostnameFromInput('https://GitHub.com/openpanel')).toBe(
      'github.com'
    );
    expect(hostnameFromInput('http://news.ycombinator.com:8080/x?y=1')).toBe(
      'news.ycombinator.com'
    );
    expect(hostnameFromInput('openpanel.dev')).toBe('openpanel.dev');
    expect(hostnameFromInput('https://user:pw@example.com/')).toBe(
      'example.com'
    );
    expect(hostnameFromInput('https://münchen.de')).toBe('xn--mnchen-3ya.de');
  });

  it('rejects what has no public favicon', () => {
    for (const input of [
      undefined,
      '',
      'not a url',
      'ftp://example.com',
      'javascript:alert(1)',
      'https://localhost',
      'https://127.0.0.1',
      'https://[::1]',
      'https://10.0.0.1:8123',
      'https://example.com.',
      'https://-bad-.com',
    ]) {
      expect([input, hostnameFromInput(input)]).toEqual([input, null]);
    }
  });
});
