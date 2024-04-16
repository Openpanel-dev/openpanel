interface ClerkError extends Error {
  longMessage: string;
}

export function getClerkError(e: unknown): ClerkError | null {
  if (e && typeof e === 'object' && 'errors' in e && Array.isArray(e.errors)) {
    const error = e.errors[0];
    if ('longMessage' in error && typeof error.longMessage === 'string') {
      return error as ClerkError;
    }
  }

  return null;
}
