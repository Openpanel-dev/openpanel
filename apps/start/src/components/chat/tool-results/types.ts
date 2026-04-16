/**
 * Minimal shape for a tool UI part that all renderers consume. We keep
 * this looser than `ToolUIPart` from the AI SDK so the registry can
 * dispatch generically without `any` casts.
 *
 * `output` is `unknown` on purpose: the registry hands the part to a
 * renderer that knows the shape, and the renderer narrows it via the
 * type guards in `output-types.ts`.
 */
export type ToolResultPart = {
  type: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

export type ToolResultProps = {
  part: ToolResultPart;
};
