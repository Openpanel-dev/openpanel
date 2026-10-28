import { anyPass, isEmpty, isNil, reject } from 'ramda';

// One event's properties become one ClickHouse Map, flattened per event on the
// ingest path, so the flattener must stay linear and bounded: an unbounded
// payload (a Node Buffer serialised byte by byte) once took ~40s per event and
// stalled the Kafka consumers. Entries past either cap are dropped. The
// per-object cap skips the root: an event's own top-level properties are what
// the user sent on purpose, and the total cap already bounds them.
export const TO_DOTS_MAX_KEYS_PER_OBJECT = 50;
export const TO_DOTS_MAX_KEYS = 1000;

// ClickHouse rejects the whole insert when a property holds a lone surrogate.
// Almost every string is well formed, so that check runs first.
const LONE_SURROGATE_REGEX =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
function removeInvalidSurrogates(value: string): string {
  if (value.isWellFormed()) {
    return value;
  }
  return value.replace(LONE_SURROGATE_REGEX, '');
}

const OPEN_BRACE = '{'.charCodeAt(0);
const CLOSE_BRACE = '}'.charCodeAt(0);
const OPEN_BRACKET = '['.charCodeAt(0);
const CLOSE_BRACKET = ']'.charCodeAt(0);

/** `json` when the string looks like a whole object/array literal, `malformed` when it only starts like one. */
function classifyString(value: string): 'json' | 'malformed' | 'text' {
  const first = value.charCodeAt(0);
  if (first !== OPEN_BRACE && first !== OPEN_BRACKET) {
    return 'text';
  }
  const last = value.charCodeAt(value.length - 1);
  const expected = first === OPEN_BRACE ? CLOSE_BRACE : CLOSE_BRACKET;
  return last === expected ? 'json' : 'malformed';
}

/** The shape `JSON.stringify(Buffer)` produces in the Node SDK. */
function isSerializedBuffer(
  value: object
): value is { type: 'Buffer'; data: number[] } {
  return (
    'type' in value &&
    value.type === 'Buffer' &&
    'data' in value &&
    Array.isArray(value.data)
  );
}

const utf8Decoder = new TextDecoder();
function decodeSerializedBuffer(value: { data: number[] }): string {
  return utf8Decoder.decode(Uint8Array.from(value.data));
}

export function toDots(
  obj: Record<string, unknown>,
  path = ''
): Record<string, string> {
  const out: Record<string, string> = {};
  let count = 0;

  const visit = (value: unknown, key: string): void => {
    if (count >= TO_DOTS_MAX_KEYS) {
      return;
    }

    if (value === undefined || value === null || value === '') {
      return;
    }

    if (typeof value === 'string') {
      const kind = classifyString(value);
      if (kind === 'malformed') {
        return;
      }
      if (kind === 'json') {
        try {
          visit(JSON.parse(value), key);
        } catch {
          // Not JSON after all: dropped like a malformed one.
        }
        return;
      }
      out[key] = removeInvalidSurrogates(value).trim();
      count += 1;
      return;
    }

    if (typeof value === 'object') {
      if (isSerializedBuffer(value)) {
        visit(decodeSerializedBuffer(value), key);
        return;
      }
      visitEntries(value, `${key}.`, TO_DOTS_MAX_KEYS_PER_OBJECT);
      return;
    }

    out[key] = String(value);
    count += 1;
  };

  // `for...in` with an early exit, because `Object.entries` on a 20k-key object
  // allocates every tuple before the cap throws them away.
  const visitEntries = (
    value: object,
    prefix: string,
    maxEntries: number
  ): void => {
    if (Array.isArray(value)) {
      const end = Math.min(value.length, maxEntries);
      for (let index = 0; index < end && count < TO_DOTS_MAX_KEYS; index++) {
        visit(value[index], `${prefix}${index}`);
      }
      return;
    }
    let seen = 0;
    for (const childKey in value) {
      if (!Object.hasOwn(value, childKey)) {
        continue;
      }
      if (seen >= maxEntries || count >= TO_DOTS_MAX_KEYS) {
        return;
      }
      seen += 1;
      visit(
        (value as Record<string, unknown>)[childKey],
        `${prefix}${childKey}`
      );
    }
  };

  visitEntries(obj, path, TO_DOTS_MAX_KEYS);

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property write, so a `__proto__` segment is a key rather than the prototype setter. */
function setOwn(target: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(target, key, {
    value,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/** The inverse of `toDots`: one mutable walk per key, where an immutable `assocPath` per key copied the growing result each time. */
export function toObject(
  obj: Record<string, string | undefined>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const segments = key.split('.');
    const leaf = segments.pop();
    if (leaf === undefined) {
      continue;
    }
    let node = result;
    for (const segment of segments) {
      const child = Object.hasOwn(node, segment) ? node[segment] : undefined;
      if (isRecord(child)) {
        node = child;
        continue;
      }
      const next: Record<string, unknown> = {};
      setOwn(node, segment, next);
      node = next;
    }
    setOwn(node, leaf, value);
  }
  return result;
}

export const strip = reject(anyPass([isEmpty, isNil]));

type AnyObject = Record<string, any>;

export function deepMergeObjects<T>(target: AnyObject, source: AnyObject): T {
  const merged: AnyObject = {};
  const allKeys = new Set([...Object.keys(target), ...Object.keys(source)]);

  allKeys.forEach((key) => {
    const targetValue = target[key];
    const sourceValue = source[key];

    if (
      (isNil(sourceValue) && !isNil(targetValue)) ||
      (sourceValue === '' &&
        typeof targetValue === 'string' &&
        targetValue !== '')
    ) {
      merged[key] = targetValue;
    } else if (
      sourceValue !== undefined &&
      isObject(targetValue) &&
      isObject(sourceValue)
    ) {
      merged[key] = deepMergeObjects(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      merged[key] = sourceValue;
    } else if (sourceValue === undefined && target[key] !== undefined) {
      merged[key] = targetValue;
    }
  });

  return merged as T;
}

function isObject(value: any): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
