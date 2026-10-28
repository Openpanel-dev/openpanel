// Entry point of the child process `execute` spawns per template run. It reads
// `{ code, payload, timeoutMs, maxOutputBytes }` as JSON from stdin and answers
// through its exit code: the parent treats any other exit (a signal, an abort
// on allocation failure) as the template having crashed the sandbox.
import { runInNewContext } from 'node:vm';
import { SANDBOX_EXIT_CODE } from './sandbox-protocol';

interface SandboxInput {
  code: string;
  payload: unknown;
  timeoutMs: number;
  maxOutputBytes: number;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function finish(exitCode: number, output: string): void {
  process.stdout.write(output, () => process.exit(exitCode));
}

function run(input: SandboxInput): void {
  // Payload and result cross as JSON, so the template never holds a reference
  // to this realm, and eval/new Function stay disabled inside it.
  const script = `'use strict'; JSON.stringify((${input.code})(JSON.parse(payloadJson)));`;
  const resultJson: unknown = runInNewContext(
    script,
    { payloadJson: JSON.stringify(input.payload) },
    {
      timeout: input.timeoutMs,
      contextCodeGeneration: { strings: false, wasm: false },
      microtaskMode: 'afterEvaluate',
    }
  );

  if (resultJson === undefined) {
    finish(SANDBOX_EXIT_CODE.ok, '');
    return;
  }
  if (typeof resultJson !== 'string') {
    finish(
      SANDBOX_EXIT_CODE.templateError,
      'Template did not return a JSON-serializable value'
    );
    return;
  }
  if (Buffer.byteLength(resultJson, 'utf8') > input.maxOutputBytes) {
    finish(SANDBOX_EXIT_CODE.templateError, 'Template output is too large');
    return;
  }
  finish(SANDBOX_EXIT_CODE.ok, resultJson);
}

try {
  run(JSON.parse(await readStdin()) as SandboxInput);
} catch (error) {
  finish(
    SANDBOX_EXIT_CODE.templateError,
    error instanceof Error ? error.message : String(error)
  );
}
