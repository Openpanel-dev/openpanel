/**
 * Checks if an object partially matches another object, including nested properties
 * @param source The object to check against
 * @param partial The partial object to match
 * @returns boolean indicating if the partial object matches the source
 */
export function isPartialMatch(source: any, partial: any): boolean {
  // Handle null/undefined cases
  if (partial === null || partial === undefined) {
    return source === partial;
  }

  // If partial is not an object, do direct comparison
  if (typeof partial !== 'object') {
    return source === partial;
  }

  // If source is null/undefined but partial is an object, no match
  if (source === null || source === undefined) {
    return false;
  }

  // Check each property in partial
  for (const key in partial) {
    if (
      Object.prototype.hasOwnProperty.call(partial, key) &&
      partial[key] !== undefined
    ) {
      // If property doesn't exist in source, no match
      if (!(key in source)) {
        return false;
      }

      // Recursively check nested objects
      if (!isPartialMatch(source[key], partial[key])) {
        return false;
      }
    }
  }

  return true;
}
