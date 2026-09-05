// Port of common/shard/CityShardRouter: a city id maps to floorMod(cityId, N)
// unless an override pins it. Pure function, so every service agrees without
// coordination.
export function floorMod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export class CityShardRouter {
  readonly shardCount: number;
  private readonly overrides: ReadonlyMap<number, number>;

  constructor(shardCount: number, overrides: Iterable<[number, number]> = []) {
    this.shardCount = shardCount;
    this.overrides = new Map(overrides);
  }

  shardIndexFor(cityId: number): number {
    const pinned = this.overrides.get(cityId);
    return pinned !== undefined ? pinned : floorMod(cityId, this.shardCount);
  }

  shardName(cityId: number): string {
    return `shard-${this.shardIndexFor(cityId)}`;
  }
}
