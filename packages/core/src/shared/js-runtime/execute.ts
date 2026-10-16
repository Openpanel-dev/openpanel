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

export function execute(
  code: string,
  payload: Record<string, unknown>
): unknown {
  // Re-check at run time: the stored string is what runs, not what passed
  // validation at save time.
  const validation = validate(code);
  if (!validation.valid) {
    throw new Error(`Invalid JavaScript template: ${validation.error}`);
  }

  try {
    // A fresh V8 context with its own globals and eval/new Function disabled.
    // Payload and result cross as JSON, so the template never holds a host-realm
    // reference. Not a security boundary on its own (the validator is), but a
    // validator miss lands in an empty realm instead of the worker process.
    const script = `'use strict'; JSON.stringify((${code})(JSON.parse(payloadJson)));`;
    const resultJson: unknown = runInNewContext(
      script,
      { payloadJson: JSON.stringify(payload) },
      {
        timeout: EXECUTION_TIMEOUT_MS,
        contextCodeGeneration: { strings: false, wasm: false },
        microtaskMode: 'afterEvaluate',
      }
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
      }`
    );
  }
}
