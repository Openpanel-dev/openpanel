// Helper, not vocabulary — ADR-008's ruling: `objectToZodEnums` has no owning
// module, so it is copied here rather than value-imported from @openpanel/core
// (same treatment ADR-007 gives the `common` math helpers).
export function objectToZodEnums<K extends string>(
  obj: Record<K, unknown>
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const mapKeys = objectToZodEnums;
