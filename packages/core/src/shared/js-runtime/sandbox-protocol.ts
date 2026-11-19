/** Exit codes `sandbox-child.ts` answers with; stdout carries the result or the error message. */
export const SANDBOX_EXIT_CODE = {
  ok: 0,
  templateError: 3,
} as const;
