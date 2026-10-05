import { parse } from '@babel/parser';
import {
  collectDeclaredIdentifiers,
  isPropertyKey,
  walkNode,
} from './ast-walker';
import {
  ALLOWED_GLOBALS,
  ALLOWED_INSTANCE_METHODS,
  ALLOWED_METHODS,
} from './constants';

/**
 * The template language is an allowlist: every AST node type the walker meets
 * must be in ALLOWED_NODE_TYPES or the template is refused, so a syntax form
 * nobody thought about is rejected by default.
 *
 * A function the template defined itself can never be called: inline arrows
 * appear only as callbacks to allowlisted methods. That removes recursion,
 * IIFEs and every "store a reference now, call it later" escape.
 */
const ALLOWED_NODE_TYPES = new Set([
  'File',
  'Program',
  'ExpressionStatement',
  'EmptyStatement',
  'ArrowFunctionExpression',
  'BlockStatement',
  'ReturnStatement',
  'IfStatement',
  'VariableDeclaration',
  'VariableDeclarator',

  'Identifier',
  'NumericLiteral',
  'StringLiteral',
  'BooleanLiteral',
  'NullLiteral',
  'RegExpLiteral',
  'TemplateLiteral',
  'TemplateElement',
  'ObjectExpression',
  'ObjectProperty',
  'ArrayExpression',
  'SpreadElement',

  'MemberExpression',
  'OptionalMemberExpression',
  'CallExpression',
  'OptionalCallExpression',
  'NewExpression',

  'BinaryExpression',
  'LogicalExpression',
  'UnaryExpression',
  'ConditionalExpression',
  'AssignmentExpression',

  'ObjectPattern',
  'ArrayPattern',
  'RestElement',
  'AssignmentPattern',
]);

/** Friendlier messages for what people are most likely to try. */
const REJECTION_MESSAGES: Record<string, string> = {
  ImportDeclaration: 'import/export statements are not allowed',
  ExportNamedDeclaration: 'import/export statements are not allowed',
  ExportDefaultDeclaration: 'import/export statements are not allowed',
  ExportAllDeclaration: 'import/export statements are not allowed',
  Import: 'Dynamic import() is not allowed',
  ImportExpression: 'Dynamic import() is not allowed',
  FunctionDeclaration:
    'Named function declarations are not allowed inside the function body.',
  FunctionExpression:
    'Function expressions are not allowed. Use arrow functions instead: (payload) => { ... }',
  ObjectMethod:
    'Methods in object literals are not allowed. Use a plain property instead.',
  WhileStatement:
    'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.',
  DoWhileStatement:
    'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.',
  ForStatement:
    'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.',
  ForInStatement:
    'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.',
  ForOfStatement:
    'Loops are not allowed. Use array methods like .map(), .filter(), .reduce() instead.',
  SwitchStatement:
    'switch statements are not allowed. Use if or a ternary expression instead.',
  TryStatement: 'try/catch statements are not allowed',
  ThrowStatement: 'throw statements are not allowed',
  WithStatement: 'with statements are not allowed',
  ClassDeclaration: 'Class definitions are not allowed',
  ClassExpression: 'Class definitions are not allowed',
  AwaitExpression: 'async/await is not allowed',
  YieldExpression: 'Generators are not allowed',
  ThisExpression:
    "'this' keyword is not allowed. Use the payload parameter instead.",
  Super: "'super' is not allowed.",
  MetaProperty: 'new.target and import.meta are not allowed.',
  TaggedTemplateExpression: 'Tagged template literals are not allowed.',
  SequenceExpression: 'Comma (sequence) expressions are not allowed.',
  UpdateExpression:
    'Increment and decrement operators (++, --) are not allowed.',
  LabeledStatement: 'Labels are not allowed.',
  DebuggerStatement: 'debugger statements are not allowed.',
};

/**
 * Property names that must never be read or written through: 'constructor'
 * walks up to the Function constructor, '__proto__' and 'prototype' reach
 * objects shared with the rest of the process.
 */
const FORBIDDEN_PROPERTIES = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'caller',
  'callee',
]);

const ALLOWED_GLOBAL_FUNCTIONS = new Set([
  'parseInt',
  'parseFloat',
  'isNaN',
  'isFinite',
]);

const ALLOWED_UNARY_OPERATORS = new Set(['!', '-', '+', 'typeof']);

const ALLOWED_ASSIGNMENT_OPERATORS = new Set([
  '=',
  '+=',
  '-=',
  '*=',
  '/=',
  '??=',
  '||=',
  '&&=',
]);

type Node = Record<string, unknown>;

/** The static name of a member expression's property, or undefined when computed. */
function staticPropertyName(member: Node): string | undefined {
  const prop = member.property as Node | undefined;
  if (!prop) {
    return undefined;
  }
  if (member.computed) {
    // Babel has already decoded \u / \x escapes; a substitution-free template
    // literal (`__proto__`) is as static as a string and must resolve the same.
    if (prop.type === 'StringLiteral') {
      return prop.value as string;
    }
    if (prop.type === 'NumericLiteral') {
      return String(prop.value);
    }
    if (prop.type === 'TemplateLiteral') {
      const expressions = prop.expressions as unknown[];
      const quasis = prop.quasis as Node[];
      if (expressions.length === 0 && quasis.length === 1) {
        const value = quasis[0]!.value as Node;
        return value.cooked as string;
      }
    }
    return undefined;
  }
  return prop.type === 'Identifier' ? (prop.name as string) : undefined;
}

/** The static key of an object literal or destructuring property, or undefined when computed. */
function staticObjectPropertyKey(prop: Node): string | undefined {
  const key = prop.key as Node | undefined;
  if (!key) {
    return undefined;
  }
  if (key.type === 'StringLiteral' || key.type === 'NumericLiteral') {
    return String(key.value);
  }
  if (!prop.computed && key.type === 'Identifier') {
    return key.name as string;
  }
  return undefined;
}

/**
 * The first forbidden property name an assignment target passes through:
 * payload.__proto__.x writes 'x' but goes through '__proto__'.
 */
function forbiddenPropertyInChain(target: Node): string | undefined {
  let current: Node | undefined = target;

  while (
    current &&
    (current.type === 'MemberExpression' ||
      current.type === 'OptionalMemberExpression')
  ) {
    const name = staticPropertyName(current);
    if (name && FORBIDDEN_PROPERTIES.has(name)) {
      return name;
    }
    current = current.object as Node | undefined;
  }

  return undefined;
}

function chainRoot(target: Node): Node | undefined {
  let current: Node | undefined = target;
  while (
    current &&
    (current.type === 'MemberExpression' ||
      current.type === 'OptionalMemberExpression')
  ) {
    current = current.object as Node | undefined;
  }
  return current;
}

function validateRoot(program: Node): string | undefined {
  const body = program.body as Node[];

  if (body.length === 0) {
    return 'Code cannot be empty';
  }

  if (body.length > 1) {
    return 'Code must contain only a single function. Multiple statements are not allowed.';
  }

  const rootStatement = body[0]!;

  if (rootStatement.type !== 'ExpressionStatement') {
    if (rootStatement.type === 'VariableDeclaration') {
      return 'Variable declarations (const, let, var) are not allowed. Use a direct function expression instead.';
    }
    if (rootStatement.type === 'FunctionDeclaration') {
      return 'Function declarations are not allowed. Use an arrow function or function expression instead: (payload) => { ... } or function(payload) { ... }';
    }
    return 'Code must be a function expression or arrow function';
  }

  const rootExpression = rootStatement.expression as Node;
  if (rootExpression.type !== 'ArrowFunctionExpression') {
    if (rootExpression.type === 'FunctionExpression') {
      return 'Function expressions are not allowed. Use arrow functions instead: (payload) => { ... }';
    }
    return 'Code must be an arrow function, e.g.: (payload) => { ... }';
  }

  return undefined;
}

function validateCall(
  callee: Node,
  declaredIdentifiers: Set<string>
): string | undefined {
  if (callee.type === 'Import') {
    return 'Dynamic import() is not allowed';
  }

  // A local variable is never callable: the only functions a template can hold
  // are inline arrows, invoked only by the allowlisted methods they are passed to.
  if (callee.type === 'Identifier') {
    const name = callee.name as string;
    if (declaredIdentifiers.has(name)) {
      return `Calling '${name}' is not allowed. Only the built-in methods can be called.`;
    }
    if (!ALLOWED_GLOBAL_FUNCTIONS.has(name)) {
      return `Calling '${name}' is not allowed. Only safe built-in functions are permitted.`;
    }
    return undefined;
  }

  if (
    callee.type !== 'MemberExpression' &&
    callee.type !== 'OptionalMemberExpression'
  ) {
    return 'Calling the result of an expression is not allowed. Call a named function or method directly.';
  }

  if (callee.computed) {
    return 'Computed property access on a call target is not allowed. Use a literal method name, e.g. value.toUpperCase().';
  }

  const obj = callee.object as Node;
  const prop = callee.property as Node;
  if (prop.type !== 'Identifier') {
    return 'Calling the result of an expression is not allowed. Call a named function or method directly.';
  }
  const methodName = prop.name as string;

  // A local that shadows the global name is an ordinary value and takes the
  // instance branch below.
  if (
    obj.type === 'Identifier' &&
    ALLOWED_GLOBALS.has(obj.name as string) &&
    !declaredIdentifiers.has(obj.name as string)
  ) {
    const objName = obj.name as string;
    if (!ALLOWED_METHODS[objName]?.has(methodName)) {
      return `Method '${objName}.${methodName}' is not allowed. Only safe methods are permitted.`;
    }
    return undefined;
  }

  if (!ALLOWED_INSTANCE_METHODS.has(methodName)) {
    return `Method '.${methodName}()' is not allowed. Only safe methods are permitted.`;
  }

  return undefined;
}

export function validate(code: string): {
  valid: boolean;
  error?: string;
} {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Code must be a non-empty string' };
  }

  try {
    const ast = parse(code, {
      sourceType: 'module',
      allowReturnOutsideFunction: true,
    });

    const rootError = validateRoot(ast.program as unknown as Node);
    if (rootError) {
      return { valid: false, error: rootError };
    }

    const declaredIdentifiers = collectDeclaredIdentifiers(ast);
    const rootArrow = (
      ((ast.program as unknown as Node).body as Node[])[0]! as Node
    ).expression as Node;

    let validationError: string | undefined;

    walkNode(ast, (node, parent) => {
      if (validationError) {
        return;
      }

      const type = node.type as string;

      if (!ALLOWED_NODE_TYPES.has(type)) {
        validationError =
          REJECTION_MESSAGES[type] ??
          `'${type}' syntax is not allowed. Templates support property access, literals, template strings, ternaries and the built-in methods.`;
        return;
      }

      if (type === 'ArrowFunctionExpression') {
        if (node.async) {
          validationError = 'async/await is not allowed';
          return;
        }
        // Besides the root, an arrow may only be a callback handed straight to
        // a call. One stored in a variable is never callable and is only useful
        // for wrapping a built-in in itself.
        const isDirectCallback =
          (parent?.type === 'CallExpression' ||
            parent?.type === 'OptionalCallExpression') &&
          (parent.arguments as Node[]).includes(node);
        if (node !== rootArrow && !isDirectCallback) {
          validationError =
            'Arrow functions are only allowed as callbacks passed directly to a method, e.g. arr.map((x) => x.name).';
          return;
        }
      }

      if (type === 'VariableDeclaration' && node.kind === 'var') {
        validationError = "'var' is not allowed. Use const or let instead.";
        return;
      }

      if (type === 'Identifier') {
        const name = node.name as string;

        if (name === 'arguments') {
          validationError =
            "'arguments' is not allowed. Use explicit parameters instead.";
          return;
        }

        if (isPropertyKey(node, parent)) {
          return;
        }

        if (declaredIdentifiers.has(name)) {
          return;
        }

        if (!ALLOWED_GLOBALS.has(name)) {
          validationError = `Use of '${name}' is not allowed. Only safe built-in functions are permitted.`;
          return;
        }
      }

      // Every read is checked, not only calls and assignments: a read of
      // 'constructor' can be stored and used later. A run-time key could be
      // any forbidden name, so it is refused too.
      if (type === 'MemberExpression' || type === 'OptionalMemberExpression') {
        const name = staticPropertyName(node);
        if (name === undefined) {
          validationError =
            'Dynamic computed property access (obj[expr]) is not allowed. Use a literal key such as obj.key, obj["key"] or arr[0].';
          return;
        }
        if (FORBIDDEN_PROPERTIES.has(name)) {
          validationError = `Accessing '${name}' is not allowed.`;
          return;
        }
      }

      if (
        type === 'ObjectProperty' &&
        parent?.type === 'ObjectExpression' &&
        staticObjectPropertyKey(node) === undefined
      ) {
        validationError =
          'Computed keys in object literals are not allowed. Use a literal key.';
        return;
      }

      if (type === 'ObjectPattern') {
        const properties = node.properties as Node[];
        for (const prop of properties) {
          if (prop.type !== 'ObjectProperty') {
            continue;
          }
          const name = staticObjectPropertyKey(prop);
          if (name === undefined) {
            validationError =
              'Computed keys in destructuring patterns are not allowed.';
            return;
          }
          if (FORBIDDEN_PROPERTIES.has(name)) {
            validationError = `Destructuring '${name}' is not allowed.`;
            return;
          }
        }
      }

      if (type === 'CallExpression' || type === 'OptionalCallExpression') {
        validationError = validateCall(
          node.callee as Node,
          declaredIdentifiers
        );
        return;
      }

      if (type === 'NewExpression') {
        const callee = node.callee as Node;

        if (callee.type !== 'Identifier') {
          validationError =
            "The target of 'new' must be a plain identifier. Only 'new Date()' is permitted.";
          return;
        }

        const name = callee.name as string;
        if (name !== 'Date' || declaredIdentifiers.has(name)) {
          validationError = `'new ${name}()' is not allowed. Only 'new Date()' is permitted.`;
          return;
        }
      }

      if (type === 'UnaryExpression') {
        const operator = node.operator as string;
        if (!ALLOWED_UNARY_OPERATORS.has(operator)) {
          validationError = `The '${operator}' operator is not allowed.`;
          return;
        }
      }

      if (type === 'AssignmentExpression') {
        const operator = node.operator as string;
        if (!ALLOWED_ASSIGNMENT_OPERATORS.has(operator)) {
          validationError = `The '${operator}' assignment operator is not allowed.`;
          return;
        }
        const target = node.left as Node;
        if (
          target.type !== 'Identifier' &&
          target.type !== 'MemberExpression'
        ) {
          validationError =
            'Assignments must target a variable or a property, e.g. out.event = payload.name.';
          return;
        }
        const reached = forbiddenPropertyInChain(target);
        if (reached) {
          validationError = `Assigning through '${reached}' is not allowed.`;
          return;
        }
        // Writing to a global replaces a built-in for the rest of the run.
        const root = chainRoot(target);
        if (
          root?.type !== 'Identifier' ||
          !declaredIdentifiers.has(root.name as string)
        ) {
          validationError =
            'Assignments may only target local variables and their properties.';
          return;
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
