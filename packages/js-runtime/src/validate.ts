import { parse } from '@babel/parser';

import {
  ALLOWED_GLOBALS,
  ALLOWED_INSTANCE_METHODS,
  ALLOWED_METHODS,
} from './constants';
import {
  collectDeclaredIdentifiers,
  isPropertyKey,
  walkNode,
} from './ast-walker';

/**
 * Validates that a JavaScript function is safe to execute
 * by checking the AST for allowed operations only (allowlist approach)
 */
export function validate(code: string): {
  valid: boolean;
  error?: string;
} {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Code must be a non-empty string' };
  }

  try {
    // Parse the code to AST
    const ast = parse(code, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      plugins: ['typescript'],
    });

    // Validate root structure: must be exactly one function expression
    const program = ast.program;
    const body = program.body;

    if (body.length === 0) {
      return { valid: false, error: 'Code cannot be empty' };
    }

    if (body.length > 1) {
      return {
        valid: false,
        error:
          'Code must contain only a single function. Multiple statements are not allowed.',
      };
    }

    const rootStatement = body[0]!;

    // Must be an expression statement containing a function
    if (rootStatement.type !== 'ExpressionStatement') {
      if (rootStatement.type === 'VariableDeclaration') {
        return {
          valid: false,
          error:
            'Variable declarations (const, let, var) are not allowed. Use a direct function expression instead.',
        };
      }
      if (rootStatement.type === 'FunctionDeclaration') {
        return {
          valid: false,
          error:
            'Function declarations are not allowed. Use an arrow function or function expression instead: (payload) => { ... } or function(payload) { ... }',
        };
      }
      return {
        valid: false,
        error: 'Code must be a function expression or arrow function',
      };
    }

    const rootExpression = rootStatement.expression;
    if (rootExpression.type !== 'ArrowFunctionExpression') {
      if (rootExpression.type === 'FunctionExpression') {
        return {
          valid: false,
          error:
            'Function expressions are not allowed. Use arrow functions instead: (payload) => { ... }',
        };
      }
      return {
        valid: false,
        error: 'Code must be an arrow function, e.g.: (payload) => { ... }',
      };
    }

    // Collect all declared identifiers (variables, parameters)
    const declaredIdentifiers = collectDeclaredIdentifiers(ast);

    let validationError: string | undefined;

    // Walk the AST to check for allowed patterns only
    walkNode(ast, (node, parent) => {
      // Skip if we already found an error
      if (validationError) {
        return;
      }

      // Block import/export declarations
      if (
        node.type === 'ImportDeclaration' ||
        node.type === 'ExportDeclaration'
      ) {
        validationError = 'import/export statements are not allowed';
        return;
      }

      // Block function declarations inside the function body
      // (FunctionDeclaration creates a named function, not allowed)
      if (node.type === 'FunctionDeclaration') {
        validationError =
          'Named function declarations are not allowed inside the function body.';
        return;
      }

      // Block loops - use array methods like .map(), .filter() instead
      if (
        node.type === 'WhileStatement' ||
        node.type === 'DoWhileStatement' ||
        node.type === 'ForStatement' ||
        node.type === 'ForInStatement' ||
        node.type === 'ForOfStatement'
      ) {
        validationError =
          'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.';
        return;
      }

      // Block advanced/dangerous features
      if (node.type === 'TryStatement') {
        validationError = 'try/catch statements are not allowed';
        return;
      }

      if (node.type === 'ThrowStatement') {
        validationError = 'throw statements are not allowed';
        return;
      }

      if (node.type === 'WithStatement') {
        validationError = 'with statements are not allowed';
        return;
      }

      if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
        validationError = 'Class definitions are not allowed';
        return;
      }

      if (node.type === 'AwaitExpression') {
        validationError = 'async/await is not allowed';
        return;
      }

      if (node.type === 'YieldExpression') {
        validationError = 'Generators are not allowed';
        return;
      }

      // Block 'this' keyword - arrow functions don't have their own 'this'
      // but we block it entirely to prevent any scope leakage
      if (node.type === 'ThisExpression') {
        validationError =
          "'this' keyword is not allowed. Use the payload parameter instead.";
        return;
      }

      // Check identifiers that reference globals
      if (node.type === 'Identifier') {
        const name = node.name as string;

        // Block 'arguments' - not available in arrow functions anyway
        // but explicitly block to prevent any confusion
        if (name === 'arguments') {
          validationError =
            "'arguments' is not allowed. Use explicit parameters instead.";
          return;
        }

        // Skip if it's a property key (not a value reference)
        if (isPropertyKey(node, parent)) {
          return;
        }

        // Skip if it's a declared local variable/parameter
        if (declaredIdentifiers.has(name)) {
          return;
        }

        // Check if it's an allowed global
        if (!ALLOWED_GLOBALS.has(name)) {
          validationError = `Use of '${name}' is not allowed. Only safe built-in functions are permitted.`;
          return;
        }
      }

      // Check method calls on global objects (like Math.random, JSON.parse)
      // Handles both regular calls and optional chaining (?.)
      if (
        node.type === 'CallExpression' ||
        node.type === 'OptionalCallExpression'
      ) {
        const callee = node.callee as Record<string, unknown>;
        const isMemberExpr =
          callee.type === 'MemberExpression' ||
          callee.type === 'OptionalMemberExpression';

        if (isMemberExpr) {
          const obj = callee.object as Record<string, unknown>;
          const prop = callee.property as Record<string, unknown>;
          const computed = callee.computed as boolean;

          // Static method call on global object: Math.random(), JSON.parse()
          if (
            obj.type === 'Identifier' &&
            prop.type === 'Identifier' &&
            !computed
          ) {
            const objName = obj.name as string;
            const methodName = prop.name as string;

            // Check if it's a call on an allowed global object
            if (ALLOWED_GLOBALS.has(objName) && ALLOWED_METHODS[objName]) {
              if (!ALLOWED_METHODS[objName].has(methodName)) {
                validationError = `Method '${objName}.${methodName}' is not allowed. Only safe methods are permitted.`;
                return;
              }
            }
          }

          // Instance method call: arr.map(), str.toLowerCase(), arr?.map()
          // We allow these if the method name is in ALLOWED_INSTANCE_METHODS
          if (prop.type === 'Identifier' && !computed) {
            const methodName = prop.name as string;

            // If calling on something other than an allowed global,
            // check if the method is in the allowed instance methods
            if (
              obj.type !== 'Identifier' ||
              !ALLOWED_GLOBALS.has(obj.name as string)
            ) {
              if (!ALLOWED_INSTANCE_METHODS.has(methodName)) {
                validationError = `Method '.${methodName}()' is not allowed. Only safe methods are permitted.`;
                return;
              }
            }
          }
        }
      }

      // Check 'new' expressions - only allow new Date()
      if (node.type === 'NewExpression') {
        const callee = node.callee as Record<string, unknown>;
        if (callee.type === 'Identifier') {
          const name = callee.name as string;
          if (name !== 'Date') {
            validationError = `'new ${name}()' is not allowed. Only 'new Date()' is permitted.`;
            return;
          }
        }
      }
    });

    if (validationError) {
      return { valid: false, error: validationError };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error:
        error instanceof Error
          ? `Parse error: ${error.message}`
          : 'Unknown parse error',
    };
  }
}
