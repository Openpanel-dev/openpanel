import { alphabetIds } from '@openpanel/constants';
import * as mathjs from 'mathjs';

/**
 * Chart formulas are a tiny arithmetic language, not a general mathjs program.
 *
 * mathjs' default namespace is powerful enough to recover the native `Function`
 * constructor (via matrix/index objects and their allowed methods), which turns
 * a user-supplied formula into remote code execution inside the API process.
 * Removing individual functions does not close this off, so we validate the
 * parsed AST against an allowlist and reject anything that is not plain
 * arithmetic over the series symbols before the expression is ever compiled.
 */

/** Operators that map to the arithmetic OpenPanel actually offers. */
const ALLOWED_OPERATOR_FUNCTIONS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'mod',
  'pow',
  'unaryMinus',
  'unaryPlus',
]);

/** Series are referenced by their alphabet id (A, B, C, ...). */
const ALLOWED_SYMBOLS = new Set<string>(alphabetIds);

/**
 * Numeric helpers that saved reports may already use. Method calls are not
 * reachable (AccessorNode is rejected), so a call can only ever resolve to one
 * of these names — `matrix`, `index` and friends stay out of reach.
 */
const ALLOWED_FUNCTIONS = new Set([
  'abs',
  'ceil',
  'floor',
  'round',
  'sqrt',
  'min',
  'max',
  'log',
  'log10',
  'exp',
]);

const MAX_FORMULA_LENGTH = 1000;

export class InvalidFormulaError extends Error {
  constructor(reason: string) {
    super(`Invalid formula: ${reason}`);
    this.name = 'InvalidFormulaError';
  }
}

function assertAllowedNode(node: mathjs.MathNode): void {
  switch (node.type) {
    case 'ConstantNode': {
      const { value } = node as mathjs.ConstantNode;
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new InvalidFormulaError('only finite numeric constants are allowed');
      }
      break;
    }

    case 'SymbolNode': {
      // A function call's callee is itself a SymbolNode, so allowed function
      // names have to pass here too. A bare `round` evaluates to a function
      // object, which `evaluateFormula` discards as non-numeric.
      const { name } = node as mathjs.SymbolNode;
      if (!(ALLOWED_SYMBOLS.has(name) || ALLOWED_FUNCTIONS.has(name))) {
        throw new InvalidFormulaError(`unknown series reference "${name}"`);
      }
      break;
    }

    case 'FunctionNode': {
      const { fn } = node as mathjs.FunctionNode;
      const name = typeof fn === 'string' ? fn : fn?.name;
      if (!(name && ALLOWED_FUNCTIONS.has(name))) {
        throw new InvalidFormulaError(`function "${name}" is not allowed`);
      }
      break;
    }

    case 'ParenthesisNode':
      break;

    case 'OperatorNode': {
      const { fn } = node as mathjs.OperatorNode;
      if (!ALLOWED_OPERATOR_FUNCTIONS.has(fn)) {
        throw new InvalidFormulaError(`operator "${fn}" is not allowed`);
      }
      break;
    }

    default:
      throw new InvalidFormulaError(`${node.type} is not allowed`);
  }

}

/**
 * Parse and validate a formula, returning a compiled expression.
 * Throws {@link InvalidFormulaError} for anything outside plain arithmetic.
 */
function compileFormula(formula: string): mathjs.EvalFunction {
  if (formula.length > MAX_FORMULA_LENGTH) {
    throw new InvalidFormulaError('formula is too long');
  }

  let node: mathjs.MathNode;
  try {
    node = mathjs.parse(formula);
  } catch {
    throw new InvalidFormulaError('could not be parsed');
  }

  // `traverse` visits the root and every descendant, so the allowlist below is
  // applied to the whole expression tree rather than a hand-rolled walk.
  node.traverse(assertAllowedNode);

  return node.compile();
}

/**
 * Formulas are evaluated once per date per series, so the same expression is
 * compiled over and over. Cache the validated, compiled form by source string.
 */
const MAX_CACHE_ENTRIES = 500;
const compiledCache = new Map<string, mathjs.EvalFunction>();

function getCompiledFormula(formula: string): mathjs.EvalFunction {
  const cached = compiledCache.get(formula);
  if (cached) {
    // Refresh recency so hot formulas survive eviction.
    compiledCache.delete(formula);
    compiledCache.set(formula, cached);
    return cached;
  }

  const compiled = compileFormula(formula);

  if (compiledCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = compiledCache.keys().next().value;
    if (oldest !== undefined) {
      compiledCache.delete(oldest);
    }
  }
  compiledCache.set(formula, compiled);

  return compiled;
}

/**
 * Returns true when the formula is plain arithmetic over series references.
 * Used to reject hostile formulas at the API boundary before they are stored.
 */
export function isValidFormula(formula: string): boolean {
  try {
    compileFormula(formula);
    return true;
  } catch {
    return false;
  }
}

/**
 * Evaluate a chart formula against a numeric scope.
 * Returns undefined when the formula is invalid or does not produce a finite
 * number, so callers can fall back without distinguishing the two.
 */
export function evaluateFormula(
  formula: string,
  scope: Record<string, number>,
): number | undefined {
  let result: unknown;
  try {
    result = getCompiledFormula(formula).evaluate(scope);
  } catch {
    return undefined;
  }

  if (typeof result !== 'number' || !Number.isFinite(result)) {
    return undefined;
  }

  return result;
}
