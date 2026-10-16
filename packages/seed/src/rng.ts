// A small deterministic PRNG. Every random choice in the seed goes through an
// `Rng` derived from the run's seed, so the same flags produce the same rows.

/* biome-ignore-all lint/suspicious/noBitwiseOperators: sfc32 is defined in 32-bit integer arithmetic */

import { createHash } from 'node:crypto';

const UUID_VARIANT_NIBBLES = ['8', '9', 'a', 'b'] as const;

/** 32 hex chars into RFC 4122 shape, stamping the version and variant nibbles. */
export function formatUuid(hex: string, version: '4' | '5'): string {
  const variant =
    UUID_VARIANT_NIBBLES[
      Number.parseInt(hex[16] ?? '0', 16) % UUID_VARIANT_NIBBLES.length
    ] ?? '8';
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${version}${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export interface Weighted<T> {
  value: T;
  weight: number;
}

const UINT32_RANGE = 4_294_967_296;
const POISSON_NORMAL_APPROXIMATION_THRESHOLD = 60;

function seedWords(seed: string): [number, number, number, number] {
  const digest = createHash('sha256').update(seed).digest();
  return [
    digest.readUInt32LE(0),
    digest.readUInt32LE(4),
    digest.readUInt32LE(8),
    digest.readUInt32LE(12),
  ];
}

/** sfc32: fast, 128-bit state, good enough statistics for synthetic traffic. */
export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private spareNormal: number | null = null;

  constructor(private readonly seed: string) {
    [this.a, this.b, this.c, this.d] = seedWords(seed);
    for (let i = 0; i < 12; i++) {
      this.next();
    }
  }

  /** A child generator whose stream is independent of the parent's position. */
  fork(...salt: (string | number)[]): Rng {
    return new Rng(`${this.seed}/${salt.join('/')}`);
  }

  private next(): number {
    this.a >>>= 0;
    this.b >>>= 0;
    this.c >>>= 0;
    this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform in [0, 1). */
  float(): number {
    return this.next() / UINT32_RANGE;
  }

  /** Uniform integer in [low, high]. */
  int(low: number, high: number): number {
    if (high <= low) {
      return low;
    }
    return low + Math.floor(this.float() * (high - low + 1));
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }

  one<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.float() * items.length)];
    if (item === undefined) {
      throw new Error('Rng.one called with an empty list');
    }
    return item;
  }

  pick<T>(items: readonly Weighted<T>[]): T {
    let total = 0;
    for (const item of items) {
      total += item.weight;
    }
    let r = this.float() * total;
    for (const item of items) {
      r -= item.weight;
      if (r <= 0) {
        return item.value;
      }
    }
    const last = items.at(-1);
    if (last === undefined) {
      throw new Error('Rng.pick called with an empty list');
    }
    return last.value;
  }

  /** Standard normal via Box–Muller. */
  normal(): number {
    if (this.spareNormal !== null) {
      const spare = this.spareNormal;
      this.spareNormal = null;
      return spare;
    }
    let u = 0;
    while (u === 0) {
      u = this.float();
    }
    const v = this.float();
    const radius = Math.sqrt(-2 * Math.log(u));
    this.spareNormal = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  }

  /** Right-skewed seconds around a median: most dwell times are short, a few are very long. */
  logNormalSeconds(median: number, sigma: number): number {
    return median * Math.exp(this.normal() * sigma);
  }

  poisson(lambda: number): number {
    if (lambda <= 0) {
      return 0;
    }
    if (lambda > POISSON_NORMAL_APPROXIMATION_THRESHOLD) {
      return Math.max(
        0,
        Math.round(lambda + Math.sqrt(lambda) * this.normal())
      );
    }
    const limit = Math.exp(-lambda);
    let count = 0;
    let product = 1;
    for (;;) {
      product *= this.float();
      if (product <= limit) {
        return count;
      }
      count++;
    }
  }

  bytes(length: number): Buffer {
    const out = Buffer.alloc(length);
    for (let offset = 0; offset < length; offset += 4) {
      const word = this.next();
      for (let b = 0; b < 4 && offset + b < length; b++) {
        out[offset + b] = (word >>> (b * 8)) & 0xff;
      }
    }
    return out;
  }

  hex(chars: number): string {
    return this.bytes(Math.ceil(chars / 2))
      .toString('hex')
      .slice(0, chars);
  }

  uuid(): string {
    return formatUuid(this.bytes(16).toString('hex'), '4');
  }

  /** The shape the ingest mints for session ids: 16 bytes, base64url, 22 chars. */
  sessionId(): string {
    return this.bytes(16).toString('base64url');
  }
}
