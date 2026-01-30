/**
 * Generates a consistent numeric hash from a string.
 * Used to deterministically select faces and colors for avatars.
 *
 * @param str - The input string to hash
 * @returns A positive 32-bit integer hash
 */
export function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash &= hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}
