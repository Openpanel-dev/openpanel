import { ALLOWED_GLOBALS, ALLOWED_INSTANCE_METHODS, ALLOWED_METHODS } from './constants';

/**
 * Simple recursive AST walker that doesn't require @babel/traverse
 */
export function walkNode(
  node: unknown,
  visitor: (
    node: Record<string, unknown>,
    parent?: Record<string, unknown>,
  ) => void,
  parent?: Record<string, unknown>,
): void {
  if (!node || typeof node !== 'object') {
    return;
  }

  // Handle arrays
  if (Array.isArray(node)) {
    for (const child of node) {
      walkNode(child, visitor, parent);
    }
    return;
  }

  const nodeObj = node as Record<string, unknown>;

  // Only visit AST nodes (they have a 'type' property)
  if (typeof nodeObj.type === 'string') {
    visitor(nodeObj, parent);
  }

  // Recursively walk all properties
  for (const key of Object.keys(nodeObj)) {
    const value = nodeObj[key];
    if (value && typeof value === 'object') {
      walkNode(value, visitor, nodeObj);
    }
  }
}

/**
 * Track declared variables/parameters to know what identifiers are "local"
 */
export function collectDeclaredIdentifiers(ast: unknown): Set<string> {
  const declared = new Set<string>();

  walkNode(ast, (node) => {
    // Variable declarations: const x = ..., let y = ..., var z = ...
    if (node.type === 'VariableDeclarator') {
      const id = node.id as Record<string, unknown>;
      if (id.type === 'Identifier') {
        declared.add(id.name as string);
      }
      // Handle destructuring patterns
      if (id.type === 'ObjectPattern') {
        collectPatternIdentifiers(id, declared);
      }
      if (id.type === 'ArrayPattern') {
        collectPatternIdentifiers(id, declared);
      }
    }

    // Function parameters
    if (
      node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration'
    ) {
      const params = node.params as Array<Record<string, unknown>>;
      for (const param of params) {
        collectPatternIdentifiers(param, declared);
      }
    }
  });

  return declared;
}

/**
 * Collect identifiers from destructuring patterns
 */
function collectPatternIdentifiers(
  pattern: Record<string, unknown>,
  declared: Set<string>,
): void {
  if (pattern.type === 'Identifier') {
    declared.add(pattern.name as string);
  } else if (pattern.type === 'ObjectPattern') {
    const properties = pattern.properties as Array<Record<string, unknown>>;
    for (const prop of properties) {
      if (prop.type === 'ObjectProperty') {
        collectPatternIdentifiers(
          prop.value as Record<string, unknown>,
          declared,
        );
      } else if (prop.type === 'RestElement') {
        collectPatternIdentifiers(
          prop.argument as Record<string, unknown>,
          declared,
        );
      }
    }
  } else if (pattern.type === 'ArrayPattern') {
    const elements = pattern.elements as Array<Record<string, unknown> | null>;
    for (const elem of elements) {
      if (elem) {
        collectPatternIdentifiers(elem, declared);
      }
    }
  } else if (pattern.type === 'RestElement') {
    collectPatternIdentifiers(
      pattern.argument as Record<string, unknown>,
      declared,
    );
  } else if (pattern.type === 'AssignmentPattern') {
    // Default parameter values: (x = 5) => ...
    collectPatternIdentifiers(
      pattern.left as Record<string, unknown>,
      declared,
    );
  }
}

/**
 * Check if an identifier is used as a property key (not a value reference)
 */
export function isPropertyKey(
  node: Record<string, unknown>,
  parent?: Record<string, unknown>,
): boolean {
  if (!parent) return false;

  // Property in object literal: { foo: value } - foo is a key
  if (
    parent.type === 'ObjectProperty' &&
    parent.key === node &&
    !parent.computed
  ) {
    return true;
  }

  // Property access: obj.foo - foo is a property access, not a global reference
  if (
    parent.type === 'MemberExpression' &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }

  // Optional chaining: obj?.foo - foo is a property access
  if (
    parent.type === 'OptionalMemberExpression' &&
    parent.property === node &&
    !parent.computed
  ) {
    return true;
  }

  // Arrow function parameter used in callback: t => t.toUpperCase()
  // The 't' in arrow function is already collected as declared identifier

  return false;
}
