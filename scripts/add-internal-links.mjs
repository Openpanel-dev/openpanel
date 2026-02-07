#!/usr/bin/env node

/**
 * Adds internal links to feature pages across MDX content files.
 *
 * Rules:
 * - Only links the FIRST mention of each feature per file
 * - Skips code blocks, inline code, existing links, headings, JSX tags, imports
 * - Skips if the feature URL is already linked somewhere on the page
 * - Skips "data retention" (not about the retention feature)
 * - Adds `updated: YYYY-MM-DD` to frontmatter of modified articles & guides
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONTENT_DIR = path.join(ROOT, 'apps/public/content');
const TODAY = '2026-02-07';

// ── Feature definitions ─────────────────────────────────────────────
// Patterns are tried in order; first match wins for each feature.
// Longer / more specific patterns come first to avoid partial matches.
const FEATURES = [
  {
    slug: 'event-tracking',
    url: '/features/event-tracking',
    patterns: ['event tracking'],
  },
  {
    slug: 'session-tracking',
    url: '/features/session-tracking',
    patterns: ['session tracking'],
  },
  {
    slug: 'revenue-tracking',
    url: '/features/revenue-tracking',
    patterns: ['revenue tracking'],
  },
  {
    slug: 'data-visualization',
    url: '/features/data-visualization',
    patterns: ['data visualization'],
  },
  {
    slug: 'identify-users',
    url: '/features/identify-users',
    patterns: ['identify users', 'user identification'],
  },
  {
    slug: 'web-analytics',
    url: '/features/web-analytics',
    patterns: ['web analytics'],
  },
  {
    slug: 'funnels',
    url: '/features/funnels',
    // "conversion funnel(s)" links to funnels, not conversion
    patterns: ['conversion funnels', 'conversion funnel', 'funnel analysis', 'funnels', 'funnel'],
  },
  {
    slug: 'retention',
    url: '/features/retention',
    // "retention" alone is included but guarded by excludeBefore
    patterns: ['retention analysis', 'user retention', 'retention rates', 'retention rate', 'retention'],
    excludeBefore: ['data', 'unlimited'],  // skip "data retention", "unlimited retention"
    excludeAfter: ['period', 'policy', 'limit', 'of data'],
  },
  {
    slug: 'conversion',
    url: '/features/conversion',
    patterns: ['conversion tracking', 'conversion rates', 'conversion rate', 'conversion paths', 'conversions', 'conversion'],
    excludeBefore: ['data'],
  },
];

// Directories to scan (relative to CONTENT_DIR)
const DIRS = ['articles', 'guides', 'docs', 'pages'];
// Only these dirs get the `updated` frontmatter field
const DIRS_WITH_UPDATED = ['articles', 'guides'];

// ── Helpers ──────────────────────────────────────────────────────────

/** Return an array of { start, end } ranges that should NOT be modified. */
function getSkipZones(text) {
  const zones = [];
  let m;

  // Fenced code blocks  ```…```
  const codeBlock = /```[\s\S]*?```/g;
  while ((m = codeBlock.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // Inline code `…`
  const inlineCode = /`[^`\n]+`/g;
  while ((m = inlineCode.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // Existing markdown links [text](url)
  const mdLink = /\[[^\]]*\]\([^)]*\)/g;
  while ((m = mdLink.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // Headings  # … (entire line)
  const heading = /^#{1,6}\s+.+$/gm;
  while ((m = heading.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // JSX / HTML tags (attributes may contain feature words)
  const jsxTag = /<[^>]+>/g;
  while ((m = jsxTag.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // import statements
  const imp = /^import\s+.+$/gm;
  while ((m = imp.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // Frontmatter block
  const fm = /^---[\s\S]*?---/;
  if ((m = fm.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // Markdown table rows (| … |)
  const tableRow = /^\|.+\|$/gm;
  while ((m = tableRow.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  // > blockquote lines that contain links
  const bqLink = /^>\s.*\[.*\]\(.*\).*$/gm;
  while ((m = bqLink.exec(text))) zones.push({ start: m.index, end: m.index + m[0].length });

  return zones;
}

function overlapsSkipZone(pos, len, zones) {
  const end = pos + len;
  return zones.some((z) => !(end <= z.start || pos >= z.end));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Core processing ──────────────────────────────────────────────────

function processFile(filePath, dir) {
  let content = fs.readFileSync(filePath, 'utf8');

  const skipZones = getSkipZones(content);
  const changes = [];

  for (const feature of FEATURES) {
    // If the file already links to this feature URL, skip entirely
    if (content.includes(feature.url)) continue;

    let linked = false;

    for (const pattern of feature.patterns) {
      if (linked) break;

      const re = new RegExp(`\\b${escapeRegex(pattern)}\\b`, 'gi');
      let m;

      while ((m = re.exec(content))) {
        // In a skip zone?
        if (overlapsSkipZone(m.index, m[0].length, skipZones)) continue;

        // Check excludeBefore / excludeAfter
        if (feature.excludeBefore) {
          const before = content.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
          if (feature.excludeBefore.some((w) => before.endsWith(w + ' '))) continue;
        }
        if (feature.excludeAfter) {
          const after = content.slice(m.index + m[0].length, m.index + m[0].length + 20).toLowerCase();
          if (feature.excludeAfter.some((w) => after.startsWith(' ' + w))) continue;
        }

        // Build replacement
        const replacement = `[${m[0]}](/features/${feature.slug})`;
        content =
          content.slice(0, m.index) +
          replacement +
          content.slice(m.index + m[0].length);

        // Add the new link as a skip zone and shift all subsequent zones
        const lenDiff = replacement.length - m[0].length;
        skipZones.push({ start: m.index, end: m.index + replacement.length });
        for (const z of skipZones) {
          if (z.start > m.index + m[0].length) {
            z.start += lenDiff;
            z.end += lenDiff;
          }
        }

        changes.push({ feature: feature.slug, matched: m[0] });
        linked = true;
        break;
      }
    }
  }

  if (changes.length === 0) return null;

  // Add / update the `updated` frontmatter field for articles & guides
  if (DIRS_WITH_UPDATED.includes(dir)) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (fmMatch) {
      let fm = fmMatch[1];
      if (/^updated:/m.test(fm)) {
        fm = fm.replace(/^updated:\s*.+$/m, `updated: ${TODAY}`);
      } else if (/^date:/m.test(fm)) {
        fm = fm.replace(/^(date:\s*.+)$/m, `$1\nupdated: ${TODAY}`);
      } else {
        fm += `\nupdated: ${TODAY}`;
      }
      content = content.replace(fmMatch[0], `---\n${fm}\n---`);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  return changes;
}

// ── Walk directories ─────────────────────────────────────────────────

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...walk(full));
    else if (e.name.endsWith('.mdx')) files.push(full);
  }
  return files;
}

// ── Main ─────────────────────────────────────────────────────────────

const results = [];

for (const dir of DIRS) {
  const dirPath = path.join(CONTENT_DIR, dir);
  if (!fs.existsSync(dirPath)) continue;

  for (const file of walk(dirPath)) {
    const changes = processFile(file, dir);
    if (changes) {
      results.push({ file: path.relative(ROOT, file), changes });
    }
  }
}

console.log('=== Internal Linking Report ===\n');
console.log(`Total files modified: ${results.length}`);
console.log(`Total links added: ${results.reduce((s, r) => s + r.changes.length, 0)}\n`);

for (const r of results) {
  console.log(`  ${r.file}`);
  for (const c of r.changes) {
    console.log(`    -> "${c.matched}" => /features/${c.feature}`);
  }
}
console.log('\nDone.');
