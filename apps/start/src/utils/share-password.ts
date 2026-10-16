/** Stands in for a stored share password, which the dashboard never receives. */
export const STORED_PASSWORD_PLACEHOLDER = '••••••••';

export function getSharePasswordFieldValue(
  hasPassword: boolean | undefined
): string {
  return hasPassword ? STORED_PASSWORD_PLACEHOLDER : '';
}

/**
 * The share mutations keep the stored password when the field is omitted and
 * remove it on null, so the untouched placeholder must not become null.
 */
export function getSharePasswordToSubmit(
  fieldValue: string | null | undefined
): string | null | undefined {
  if (fieldValue === STORED_PASSWORD_PLACEHOLDER) {
    return undefined;
  }
  return fieldValue || null;
}
