import { describe, expect, it } from 'vitest';
import { evaluateFormula, isValidFormula } from './formula';

const scope = { A: 10, B: 4, C: 0 };

describe('evaluateFormula', () => {
  it('evaluates the arithmetic the chart UI advertises', () => {
    expect(evaluateFormula('A+B', scope)).toBe(14);
    expect(evaluateFormula('A-B', scope)).toBe(6);
    expect(evaluateFormula('A*B', scope)).toBe(40);
    expect(evaluateFormula('A/B', scope)).toBe(2.5);
    expect(evaluateFormula('A%B', scope)).toBe(2);
    expect(evaluateFormula('B^2', scope)).toBe(16);
  });

  it('supports parentheses, unary signs and numeric constants', () => {
    expect(evaluateFormula('(A-B)*100', scope)).toBe(600);
    expect(evaluateFormula('-A', scope)).toBe(-10);
    expect(evaluateFormula('+A', scope)).toBe(10);
    expect(evaluateFormula('A/B*100', scope)).toBe(250);
    expect(evaluateFormula('1.5*A', scope)).toBe(15);
  });

  it('supports the numeric helpers saved reports may already use', () => {
    expect(evaluateFormula('round(A/B, 1)', scope)).toBe(2.5);
    expect(evaluateFormula('abs(B-A)', scope)).toBe(6);
    expect(evaluateFormula('max(A, B)', scope)).toBe(10);
    expect(evaluateFormula('min(A, B)', scope)).toBe(4);
    expect(evaluateFormula('floor(A/B)', scope)).toBe(2);
    expect(evaluateFormula('ceil(A/B)', scope)).toBe(3);
    expect(evaluateFormula('sqrt(B)', scope)).toBe(2);
  });

  it('returns undefined for non-finite results instead of throwing', () => {
    expect(evaluateFormula('A/C', scope)).toBeUndefined();
    expect(evaluateFormula('C/C', scope)).toBeUndefined();
  });

  it('caches compiled formulas without leaking scope between evaluations', () => {
    expect(evaluateFormula('A+B', { A: 1, B: 2 })).toBe(3);
    expect(evaluateFormula('A+B', { A: 10, B: 20 })).toBe(30);
  });
});

describe('isValidFormula', () => {
  it('accepts plain arithmetic', () => {
    for (const formula of ['A+B', 'A/B', '(A-B)*100', '-A', 'A%B', 'B^2']) {
      expect(isValidFormula(formula)).toBe(true);
    }
  });

  it('rejects the mathjs constructor-recovery payload (GHSA-7476-c5cc-8999)', () => {
    // Verbatim from the advisory: recovers the native Function constructor via
    // Index.toJSON() dimensions + DenseMatrix.subset() callbacks.
    const payload = `m = matrix([[0,0],[0,0]]);
idx = index([0,1],[0,1]);
dims = idx.toJSON()["dimensions"];
d1 = {
  "size": s1() = matrix([1]).toArray(),
  "max": x1() = 0,
  "forEach": e1(callback) = callback(0, matrix(["flatMap"]).toArray())
};
d2 = {
  "size": s2() = matrix([1]).toArray(),
  "max": x2() = 0,
  "forEach": e2(callback) = callback(0, matrix(["constructor"]).toArray())
};
dims.splice(0, 1, d1);
dims.splice(1, 1, d2);
m.subset(idx, [[0]]);
FunctionCtor = m.get(matrix([0,0]).toArray());
run = FunctionCtor(
  "return process.getBuiltinModule('node:child_process')" +
  ".execFileSync('/usr/bin/id').toString()"
);
run()`;

    expect(isValidFormula(payload)).toBe(false);
    expect(evaluateFormula(payload, scope)).toBeUndefined();
  });

  it('rejects every node type outside plain arithmetic', () => {
    const rejected = [
      'A; B', // BlockNode
      'x = A', // AssignmentNode
      'f(x) = x', // FunctionAssignmentNode
      'config({})', // FunctionNode, not in the allowlist
      'matrix([[0,0],[0,0]])', // FunctionNode / ArrayNode
      'index([0,1],[0,1])', // FunctionNode, not in the allowlist
      'A.subset(B)', // AccessorNode — blocks every method call
      '{"a": 1}', // ObjectNode
      '[1, 2, 3]', // ArrayNode
      'A[1]', // IndexNode / AccessorNode
      'A.constructor', // AccessorNode
      '1:5', // RangeNode
      'A > B ? A : B', // ConditionalNode
      'A!', // factorial OperatorNode
      'A and B', // logical OperatorNode
    ];

    for (const formula of rejected) {
      expect(isValidFormula(formula), formula).toBe(false);
    }
  });

  it('rejects symbols that are neither series references nor allowed functions', () => {
    expect(isValidFormula('process')).toBe(false);
    expect(isValidFormula('pi')).toBe(false);
    expect(isValidFormula('A + e')).toBe(false);
    expect(isValidFormula('matrix')).toBe(false);
  });

  it('discards a bare function reference as a non-numeric result', () => {
    // `round` passes the AST check as a callee name, but on its own it
    // evaluates to a function object rather than a number.
    expect(evaluateFormula('round', scope)).toBeUndefined();
  });

  it('rejects unparseable and oversized input', () => {
    expect(isValidFormula('A +')).toBe(false);
    expect(isValidFormula('A'.repeat(1001))).toBe(false);
  });
});
