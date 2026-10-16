// Copied rather than value-imported from @openpanel/core.
export function objectToZodEnums<K extends string>(
  obj: Record<K, unknown>
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const mapKeys = objectToZodEnums;
