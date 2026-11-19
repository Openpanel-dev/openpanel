/**
 * Tests for the generated datacenter/hosting ASN list, exercising list
 * membership (no MaxMind db needed) and the parser. Known hosting providers must
 * stay classified as datacenters, and residential ISPs must NOT be in the list,
 * so real end users are never marked as bots.
 */

import { describe, expect, it } from 'bun:test';
import { parseAsnList } from '../../scripts/get-datacenter-asns';
import datacenterAsns from './datacenter-asns';

describe('datacenter ASN list', () => {
  const asnSet = new Set(datacenterAsns);

  describe('classifies known hosting providers as datacenters', () => {
    const hosting: Record<string, number> = {
      Google: 15_169,
      Amazon: 16_509,
      Azure: 8075,
      OVH: 16_276,
      Hetzner: 24_940,
      DigitalOcean: 14_061,
      Linode: 63_949,
      Vultr: 20_473,
    };

    for (const [name, asn] of Object.entries(hosting)) {
      it(`flags ${name} (AS${asn})`, () => {
        expect(asnSet.has(asn)).toBe(true);
      });
    }
  });

  describe('does not flag residential ISPs', () => {
    const residential: Record<string, number> = {
      Comcast: 7922,
      'AT&T': 7018,
      Verizon: 701,
      'Deutsche Telekom': 3320,
      Telia: 3301,
    };

    for (const [name, asn] of Object.entries(residential)) {
      it(`treats ${name} (AS${asn}) as a real user`, () => {
        expect(asnSet.has(asn)).toBe(false);
      });
    }
  });

  it('is non-empty and contains only positive integers', () => {
    expect(datacenterAsns.length).toBeGreaterThan(100);
    for (const asn of datacenterAsns) {
      expect(Number.isInteger(asn)).toBe(true);
      expect(asn).toBeGreaterThan(0);
    }
  });
});

describe('parseAsnList', () => {
  it('parses `AS<number>` lines and ignores comments/blanks', () => {
    const raw = [
      'AS14061 # DIGITALOCEAN-ASN - DigitalOcean, LLC, US',
      'AS16509 # AMAZON-02, US',
      '',
      '# a stray comment line',
      'not-an-asn-line',
      'AS15169',
    ].join('\n');

    expect(parseAsnList(raw)).toEqual([14_061, 15_169, 16_509]);
  });

  it('de-duplicates and sorts ascending', () => {
    expect(parseAsnList('AS20\nAS10\nAS20\nAS10')).toEqual([10, 20]);
  });
});
