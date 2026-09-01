import { expect, test } from 'bun:test';
import { isEnvelope, unwrap, wrap } from './envelope';

test('an envelope round-trips through wrap and unwrap', () => {
  const envelope = wrap({ importId: 'imp_1' }, { requestId: 'req_1' });

  expect(envelope).toEqual({
    payload: { importId: 'imp_1' },
    meta: { requestId: 'req_1' },
  });
  expect(unwrap(envelope)).toEqual(envelope);
  // It has to survive Redis, which stores it as JSON.
  expect(unwrap(JSON.parse(JSON.stringify(envelope)))).toEqual(envelope);
});

// A payload-less job (cron) still has to survive JSON, which drops an
// undefined value and with it the very key `isEnvelope` looks for.
test('a payload-less job round-trips as null, not as a missing key', () => {
  const envelope = wrap(undefined, {});

  expect(envelope).toEqual({ payload: null, meta: {} });
  expect(isEnvelope(JSON.parse(JSON.stringify(envelope)))).toBe(true);
  expect(unwrap(JSON.parse(JSON.stringify(envelope))).payload).toBeNull();
});

// The detection rule is `'payload' in data && 'meta' in data`, and the reason
// for the second half is right here: `cohortCompute` is a bare `{cohortId}`
// and the other five legacy shapes carry a `payload` of their own.
test('a bare {cohortId} is not mistaken for an envelope', () => {
  expect(isEnvelope({ cohortId: 'coh_1' })).toBe(false);
  expect(() => unwrap({ cohortId: 'coh_1' })).toThrow(/not a job envelope/);
});

test('a legacy {type, payload} is not mistaken for an envelope', () => {
  expect(isEnvelope({ type: 'import', payload: { importId: 'imp_1' } })).toBe(
    false
  );
  expect(isEnvelope({ type: 'salt' })).toBe(false);
  expect(isEnvelope({ meta: { requestId: 'req_1' } })).toBe(false);
});

test('nothing that is not an object is an envelope', () => {
  expect(isEnvelope(null)).toBe(false);
  expect(isEnvelope(undefined)).toBe(false);
  expect(isEnvelope('payload')).toBe(false);
  expect(() => unwrap(null)).toThrow(/not a job envelope/);
});
