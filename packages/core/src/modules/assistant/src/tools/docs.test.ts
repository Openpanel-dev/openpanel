import { describe, expect, test } from 'bun:test';
import { rankSections } from './docs';

const sections = [
  {
    title: 'MCP Server',
    url: 'https://openpanel.dev/docs/mcp',
    body: 'Connect Claude, Cursor and other AI clients to your analytics with the Model Context Protocol. Create a read client to get a token.',
    lowerTitle: 'mcp server',
    lowerBody:
      'connect claude, cursor and other ai clients to your analytics with the model context protocol. create a read client to get a token.',
  },
  {
    title: 'Track events',
    url: 'https://openpanel.dev/docs/get-started/track-events',
    body: 'Call op.track with a name and properties. Events show up in the events page.',
    lowerTitle: 'track events',
    lowerBody:
      'call op.track with a name and properties. events show up in the events page.',
  },
];

describe('rankSections', () => {
  test('title matches outrank body matches', () => {
    const results = rankSections(
      sections,
      'how do I connect the MCP server to Claude'
    );
    expect(results[0]?.title).toBe('MCP Server');
  });

  test('short words and unknown terms match nothing', () => {
    expect(rankSections(sections, 'an it')).toEqual([]);
    expect(rankSections(sections, 'kubernetes')).toEqual([]);
  });
});
