/** Stands in for a stored share password, which the dashboard never receives. */
export const STORED_PASSWORD_PLACEHOLDER = '••••••••';

export function getSharePasswordFieldValue(
  hasPassword: boolean | undefined
): string {
  return hasPassword ? STORED_PASSWORD_PLACEHOLDER : '';
}

/**
 * The share mutations keep the stored password when the field is omitted and
 * remove it on null. Only a deliberate edit may remove it: an untouched field
 * is empty whenever the settings have not loaded, and is not a removal.
 */
export function getSharePasswordToSubmit(
  fieldValue: string | null | undefined,
  isEdited: boolean
): string | null | undefined {
  if (!isEdited || fieldValue === STORED_PASSWORD_PLACEHOLDER) {
    return undefined;
  }
  return fieldValue || null;
}
