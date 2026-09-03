/**
 * Allowed global identifiers - super restricted allowlist
 */
export const ALLOWED_GLOBALS = new Set([
  // Basic values for comparisons
  'undefined',
  'null',

  // Type coercion functions
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',

  // Safe built-in objects (for static methods only)
  'Math',
  'Date',
  'JSON',
]);

/**
 * Allowed methods on built-in objects (static methods)
 */
export const ALLOWED_METHODS: Record<string, Set<string>> = {
  // Math methods
  Math: new Set(['abs', 'ceil', 'floor', 'round', 'min', 'max', 'random']),

  // JSON methods
  JSON: new Set(['parse', 'stringify']),

  // Date static methods
  Date: new Set(['now']),
};

/**
 * Allowed instance methods (methods called on values, not on global objects)
 * These are safe methods that can be called on any value
 */
export const ALLOWED_INSTANCE_METHODS = new Set([
  // Array instance methods
  'map',
  'filter',
  'reduce',
  'reduceRight',
  'forEach',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'some',
  'every',
  'includes',
  'indexOf',
  'lastIndexOf',
  'slice',
  'concat',
  'join',
  'flat',
  'flatMap',
  'sort',
  'reverse',
  'fill',
  'at',
  'with',
  'toSorted',
  'toReversed',
  'toSpliced',

  // String instance methods
  'toLowerCase',
  'toUpperCase',
  'toLocaleLowerCase',
  'toLocaleUpperCase',
  'trim',
  'trimStart',
  'trimEnd',
  'padStart',
  'padEnd',
  'repeat',
  'replace',
  'replaceAll',
  'split',
  'substring',
  'substr',
  'charAt',
  'charCodeAt',
  'codePointAt',
  'startsWith',
  'endsWith',
  'match',
  'matchAll',
  'search',
  'normalize',
  'localeCompare',

  // Number instance methods
  'toFixed',
  'toPrecision',
  'toExponential',
  'toLocaleString',

  // Date instance methods
  'getTime',
  'getFullYear',
  'getMonth',
  'getDate',
  'getDay',
  'getHours',
  'getMinutes',
  'getSeconds',
  'getMilliseconds',
  'getUTCFullYear',
  'getUTCMonth',
  'getUTCDate',
  'getUTCDay',
  'getUTCHours',
  'getUTCMinutes',
  'getUTCSeconds',
  'getUTCMilliseconds',
  'getTimezoneOffset',
  'toISOString',
  'toJSON',
  'toDateString',
  'toTimeString',
  'toLocaleDateString',
  'toLocaleTimeString',
  'valueOf',

  // Object instance methods
  'hasOwnProperty',
  'toString',
  'valueOf',

  // RegExp instance methods
  'test',
  'exec',

  // Common property access (length, etc.)
  'length',
  'size',
]);
