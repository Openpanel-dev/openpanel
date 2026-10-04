import { describe, expect, it } from 'vitest';
import {
  getSharePasswordFieldValue,
  getSharePasswordToSubmit,
  STORED_PASSWORD_PLACEHOLDER,
} from './share-password';

describe('getSharePasswordToSubmit', () => {
  it('omits the password when the placeholder is untouched', () => {
    expect(getSharePasswordToSubmit(STORED_PASSWORD_PLACEHOLDER)).toBe(
      undefined
    );
  });

  it('removes the password when the field was cleared', () => {
    expect(getSharePasswordToSubmit('')).toBe(null);
  });

  it('sends a typed password', () => {
    expect(getSharePasswordToSubmit('hunter2')).toBe('hunter2');
  });
});

describe('getSharePasswordFieldValue', () => {
  it('shows the placeholder only for a share with a password', () => {
    expect(getSharePasswordFieldValue(true)).toBe(STORED_PASSWORD_PLACEHOLDER);
    expect(getSharePasswordFieldValue(false)).toBe('');
    expect(getSharePasswordFieldValue(undefined)).toBe('');
  });
});
