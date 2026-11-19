// No owning module — copied rather than value-imported from core.
export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
