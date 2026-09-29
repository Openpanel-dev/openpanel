// Helper, not vocabulary: `objectToZodEnums` has no owning module, so it is
// copied here rather than value-imported from @openpanel/core (same
// treatment the `common` math helpers get).
export function objectToZodEnums<K extends string>(
  obj: Record<K, unknown>
): [K, ...K[]] {
  const [firstKey, ...otherKeys] = Object.keys(obj) as K[];
  return [firstKey!, ...otherKeys];
}

export const mapKeys = objectToZodEnums;
