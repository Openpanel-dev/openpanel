import { validate } from './validate';

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
  // ends up in new Function() here. Check it again at run time rather than
  // trusting whatever passed validation at save time.
  const validation = validate(code);
  if (!validation.valid) {
    throw new Error(`Invalid JavaScript template: ${validation.error}`);
  }

  try {
    // Create the function code that will be executed
    // 'use strict' ensures 'this' is undefined (not global object)
    const funcCode = `
      'use strict';
      return (${code})(payload);
    `;

    // Create function with safe globals in scope
    const func = new Function('payload', funcCode);

    // Execute the function
    return func(payload);
  } catch (error) {
    throw new Error(
      `Error executing JavaScript template: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
