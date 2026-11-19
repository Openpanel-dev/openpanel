// Filter patterns are written by project members and run against tracking
// payloads on the event consumer, so they go through RE2 (linear time, no
// backtracking) rather than the native engine. RE2 is also what ClickHouse
// uses for the same `regex` operator in reports.

import { stripLeadingAndTrailingSlashes } from '@openpanel/shared';
import { LRUCache } from 'lru-cache';
import { RE2JS } from 're2js';
import type { Logger } from '../../../logger';

const COMPILED_PATTERN_CACHE_MAX_ENTRIES = 1000;

/** Total time a pattern may take to compile and run over every probe. */
export const REGEX_VALIDATION_BUDGET_MS = 50;

const PROBE_LENGTH = 20_000;

// Long runs of one character class and near-misses: what makes a slow
// pattern visible, even in a linear-time engine.
const PROBE_INPUTS = [
  'a'.repeat(PROBE_LENGTH),
  `${'a'.repeat(PROBE_LENGTH)}!`,
  'ab'.repeat(PROBE_LENGTH / 2),
  `${'0'.repeat(PROBE_LENGTH)}x`,
  `${' '.repeat(PROBE_LENGTH)}\n`,
  `${'/path'.repeat(PROBE_LENGTH / 5)}?`,
];

type CompiledPattern = { regex: RE2JS } | { error: string };

const compiledPatterns = new LRUCache<string, CompiledPattern>({
  max: COMPILED_PATTERN_CACHE_MAX_ENTRIES,
});

/** The dashboard lets people write `/pattern/`; the slashes are not part of it. */
export function toFilterPattern(value: unknown): string {
  return stripLeadingAndTrailingSlashes(String(value));
}

function compilePattern(pattern: string): CompiledPattern {
  try {
    return { regex: RE2JS.compile(pattern) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Compiled once per process per pattern. A pattern RE2 cannot compile (a rule
 * saved before RE2, using lookaround or backreferences) never matches, and is
 * logged the first time it is seen.
 */
export function testFilterPattern(
  pattern: string,
  input: string,
  logger?: Logger
): boolean {
  let compiled = compiledPatterns.get(pattern);
  if (!compiled) {
    compiled = compilePattern(pattern);
    compiledPatterns.set(pattern, compiled);
    if ('error' in compiled) {
      logger?.warn(
        { pattern, error: compiled.error },
        'Filter regex is not valid RE2, treating it as non-matching'
      );
    }
  }
  return 'regex' in compiled && compiled.regex.test(input);
}

// Timed twice and judged on the faster run: the first one also pays for JIT
// warm-up, and either can land on a GC pause or a busy event loop. A pattern
// that is slow by construction is slow both times.
const VALIDATION_TIMING_RUNS = 2;

function probeDurationMs(regex: { test: (input: string) => boolean }): number {
  const startedAt = performance.now();
  for (const probe of PROBE_INPUTS) {
    regex.test(probe);
    if (performance.now() - startedAt > REGEX_VALIDATION_BUDGET_MS) {
      break;
    }
  }
  return performance.now() - startedAt;
}

/** An error message for a pattern that cannot be saved, or undefined. */
export function validateFilterPattern(pattern: string): string | undefined {
  const compiled = compilePattern(pattern);
  if ('error' in compiled) {
    return `Invalid regular expression "${pattern}": ${compiled.error}`;
  }
  for (let run = 0; run < VALIDATION_TIMING_RUNS; run++) {
    if (probeDurationMs(compiled.regex) <= REGEX_VALIDATION_BUDGET_MS) {
      return undefined;
    }
  }
  return `Regular expression "${pattern}" is too slow to evaluate. Simplify it, for example by removing nested or large repetitions.`;
}
