import { appArchetype } from './app';
import type { Archetype } from './archetype';
import { ecommerceArchetype } from './ecommerce';
import { saasArchetype } from './saas';
import { websiteArchetype } from './website';

export const ARCHETYPES: readonly Archetype[] = [
  websiteArchetype,
  saasArchetype,
  ecommerceArchetype,
  appArchetype,
];

export const ARCHETYPE_IDS = ARCHETYPES.map((archetype) => archetype.id);

export function archetypeById(id: string): Archetype {
  const archetype = ARCHETYPES.find((candidate) => candidate.id === id);
  if (!archetype) {
    throw new Error(
      `Unknown archetype "${id}". Known: ${ARCHETYPE_IDS.join(', ')}`
    );
  }
  return archetype;
}

export type { Archetype, ArchetypeId } from './archetype';
