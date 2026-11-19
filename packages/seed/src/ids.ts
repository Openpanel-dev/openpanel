import { createHash } from 'node:crypto';
import { slug } from '@openpanel/shared';
import type { Archetype } from './archetypes/archetype';
import { formatUuid } from './rng';
import { ID_NAMESPACE } from './seed.constants';

function namespaceBytes(): Buffer {
  return Buffer.from(ID_NAMESPACE.replace(/-/g, ''), 'hex');
}

/** RFC 4122 v5: the same name always yields the same uuid, so re-runs upsert. */
export function deterministicUuid(name: string): string {
  const digest = createHash('sha1')
    .update(namespaceBytes())
    .update(name)
    .digest();
  return formatUuid(digest.subarray(0, 16).toString('hex'), '5');
}

/** The same slug id the onboarding flow would mint for the project name. */
export function projectIdFor(archetype: Archetype): string {
  return slug(archetype.projectName);
}
