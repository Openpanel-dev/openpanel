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
