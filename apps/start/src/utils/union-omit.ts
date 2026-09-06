// No owning module (ADR-008) — copied rather than value-imported from core.
export type UnionOmit<T, K extends keyof any> = T extends any
  ? Omit<T, K>
  : never;
