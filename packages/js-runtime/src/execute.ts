import { runInNewContext } from 'node:vm';

import { validate } from './validate';

/**
 * Wall-clock budget for one template run. The validator refuses loops,
 * recursion and calls to template-defined functions, so an honest template
 * finishes in a few milliseconds; this is the backstop for a pathological
 * regex or a huge .repeat().
 */
const EXECUTION_TIMEOUT_MS = 250;

/** Cap on the serialized output so a template cannot balloon a webhook body. */
const MAX_OUTPUT_BYTES = 1_000_000;

/**
 * Executes a JavaScript function template
 * @param code - JavaScript function code (arrow function or function expression)
 * @param payload - Payload object to pass to the function
 * @returns The result of executing the function
 */
export function execute(
  code: string,
  payload: Record<string, unknown>,
): unknown {
  // Templates are checked when they are saved, but the stored string is what
  // ends up being run here. Check it again at run time rather than trusting
  // whatever passed validation at save time.
  const validation = validate(code);
  if (!validation.valid) {
    throw new Error(`Invalid JavaScript template: ${validation.error}`);
  }

  try {
    // The template runs in a fresh V8 context with its own globals, with
    // eval/new Function disabled there. The payload crosses in as JSON and
    // the result crosses out as JSON, so the template never holds a
    // reference to a host-realm object and nothing it returns carries a host
    // prototype or function back into the worker. This is not a security
    // boundary on its own (the validator is), but it means a validator miss
    // lands in an empty realm instead of the worker process.
    const script = `'use strict'; JSON.stringify((${code})(JSON.parse(payloadJson)));`;
    const resultJson: unknown = runInNewContext(
      script,
      { payloadJson: JSON.stringify(payload) },
      {
        timeout: EXECUTION_TIMEOUT_MS,
        contextCodeGeneration: { strings: false, wasm: false },
        microtaskMode: 'afterEvaluate',
      },
    );

    if (resultJson === undefined) {
      return undefined;
    }
    if (typeof resultJson !== 'string') {
      throw new Error('Template did not return a JSON-serializable value');
    }
    if (Buffer.byteLength(resultJson, 'utf8') > MAX_OUTPUT_BYTES) {
      throw new Error('Template output is too large');
    }
    return JSON.parse(resultJson);
  } catch (error) {
    throw new Error(
      `Error executing JavaScript template: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
