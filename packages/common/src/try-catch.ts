export type TryCatchResult<T, E = Error> =
  | { ok: true; data: T; error: null }
  | { ok: false; data: null; error: E };

export async function tryCatch<T, E = Error>(
  input: (() => Promise<T>) | Promise<T>,
): Promise<TryCatchResult<T, E>> {
  try {
    const promise = typeof input === 'function' ? input() : input;
    const data = await promise;
    return { ok: true, data, error: null };
  } catch (error) {
    return { ok: false, data: null, error: error as E };
  }
}