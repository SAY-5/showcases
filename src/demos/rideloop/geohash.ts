// Geohash encode, decode and neighbors, a port of rideloop_common/geohash.py.
// A geohash interleaves longitude and latitude bits five at a time into a
// base32 alphabet. A prefix is a bounding box containing the full hash, which
// is what makes it a good partition key.
export const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const DECODE = new Map<string, number>();
for (let i = 0; i < BASE32.length; i++) DECODE.set(BASE32[i], i);

export const DEFAULT_PRECISION = 6;

export type Direction = 'n' | 's' | 'e' | 'w';

const NEIGHBORS: Record<Direction, [string, string]> = {
  n: ['p0r21436x8zb9dcf5h7kjnmqesgutwvy', 'bc01fg45238967deuvhjyznpkmstqrwx'],
  s: ['14365h7k9dcfesgujnmqp0r2twvyx8zb', '238967debc01fg45kmstqrwxuvhjyznp'],
  e: ['bc01fg45238967deuvhjyznpkmstqrwx', 'p0r21436x8zb9dcf5h7kjnmqesgutwvy'],
  w: ['238967debc01fg45kmstqrwxuvhjyznp', '14365h7k9dcfesgujnmqp0r2twvyx8zb'],
};
const BORDERS: Record<Direction, [string, string]> = {
  n: ['prxz', 'bcfguvyz'],
  s: ['028b', '0145hjnp'],
  e: ['bcfguvyz', 'prxz'],
  w: ['0145hjnp', '028b'],
};

export function encode(lat: number, lng: number, precision: number = DEFAULT_PRECISION): string {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let out = '';
  let bits = 0;
  let value = 0;
  let even = true;
  while (out.length < precision) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) {
        value = (value << 1) | 1;
        lngLo = mid;
      } else {
        value <<= 1;
        lngHi = mid;
      }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) {
        value = (value << 1) | 1;
        latLo = mid;
      } else {
        value <<= 1;
        latHi = mid;
      }
    }
    even = !even;
    bits += 1;
    if (bits === 5) {
      out += BASE32[value];
      bits = 0;
      value = 0;
    }
  }
  return out;
}

export type Bbox = readonly [latMin: number, latMax: number, lngMin: number, lngMax: number];

export function decodeBbox(hash: string): Bbox {
  let latLo = -90;
  let latHi = 90;
  let lngLo = -180;
  let lngHi = 180;
  let even = true;
  for (const ch of hash) {
    const value = DECODE.get(ch) ?? 0;
    for (const shift of [4, 3, 2, 1, 0]) {
      const bit = (value >> shift) & 1;
      if (even) {
        const mid = (lngLo + lngHi) / 2;
        if (bit) lngLo = mid;
        else lngHi = mid;
      } else {
        const mid = (latLo + latHi) / 2;
        if (bit) latLo = mid;
        else latHi = mid;
      }
      even = !even;
    }
  }
  return [latLo, latHi, lngLo, lngHi];
}

export function decode(hash: string): [number, number] {
  const [latLo, latHi, lngLo, lngHi] = decodeBbox(hash);
  return [(latLo + latHi) / 2, (lngLo + lngHi) / 2];
}

export function adjacent(hash: string, direction: Direction): string {
  const last = hash[hash.length - 1];
  let parent = hash.slice(0, -1);
  const kind = hash.length % 2;
  if (BORDERS[direction][kind].includes(last) && parent) {
    parent = adjacent(parent, direction);
  }
  const idx = NEIGHBORS[direction][kind].indexOf(last);
  return parent + BASE32[idx];
}

// The 8 surrounding cells, starting north and going clockwise.
export function neighbors(hash: string): string[] {
  const n = adjacent(hash, 'n');
  const s = adjacent(hash, 's');
  return [
    n,
    adjacent(n, 'e'),
    adjacent(hash, 'e'),
    adjacent(s, 'e'),
    s,
    adjacent(s, 'w'),
    adjacent(hash, 'w'),
    adjacent(n, 'w'),
  ];
}

// The cell itself followed by its 8 neighbors: the 3x3 block used for lookups.
export function cellWithNeighbors(hash: string): string[] {
  return [hash, ...neighbors(hash)];
}
