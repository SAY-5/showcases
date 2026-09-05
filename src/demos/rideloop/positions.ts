// In-memory driver position index partitioned by geohash cell with TTL, a
// port of DriverPositionStore in rideloop_common/dynamo.py.
//
//   partition key  cell      geohash at precision 5 (about 4.9 km square)
//   sort key       driverId
//   attributes     geohash (precision 6), lat, lng, heading, status, tripId, updatedAt, ttl
//
// A nearby lookup reads the rider's cell plus its neighbors, drops anything
// whose ttl has passed (the read side treats ttl as authoritative because the
// background deleter is lazy) and ranks by haversine distance.
import { haversineM, offsetM } from './geo';
import * as geohash from './geohash';

export type DriverStatus = 'available' | 'busy' | 'offline';

export interface PositionItem {
  driverId: string;
  cell: string;
  geohash: string;
  lat: number;
  lng: number;
  heading: number;
  status: DriverStatus;
  tripId: string | null;
  updatedAt: number;
  ttl: number;
}

export interface NearbyDriver extends PositionItem {
  distanceM: number;
}

export interface QueryPlanEntry {
  cell: string;
  subcells: string[] | null;
}

export interface NearbyResult {
  drivers: NearbyDriver[];
  plan: QueryPlanEntry[];
  rowsRead: number;
}

// Above this many precision-6 subcells a search reads the whole 3x3 block.
export const MAX_SUBCELL_FILTER = 64;

export class PositionIndex {
  private readonly cells = new Map<string, Map<string, PositionItem>>();
  private readonly byDriver = new Map<string, PositionItem>();
  claimAttempts = 0;
  claimsWon = 0;

  readonly cellPrecision: number;
  readonly ttlSeconds: number;

  constructor(cellPrecision = 5, ttlSeconds = 20) {
    this.cellPrecision = cellPrecision;
    this.ttlSeconds = ttlSeconds;
  }

  partitionSize(cell: string): number {
    return this.cells.get(cell)?.size ?? 0;
  }

  // Upsert a driver's position, keeping its dispatch status intact.
  putPosition(driverId: string, lat: number, lng: number, heading: number, now: number): PositionItem {
    const cell = geohash.encode(lat, lng, this.cellPrecision);
    const fine = geohash.encode(lat, lng, geohash.DEFAULT_PRECISION);
    const current = this.byDriver.get(driverId);
    const item: PositionItem = {
      driverId,
      cell,
      geohash: fine,
      lat,
      lng,
      heading,
      status: current?.status ?? 'available',
      tripId: current?.tripId ?? null,
      updatedAt: now,
      ttl: now + this.ttlSeconds,
    };
    if (current && current.cell !== cell) {
      // cell change: delete the old item and put the new one as one transaction
      this.cells.get(current.cell)?.delete(driverId);
    }
    let partition = this.cells.get(cell);
    if (!partition) {
      partition = new Map();
      this.cells.set(cell, partition);
    }
    partition.set(driverId, item);
    this.byDriver.set(driverId, item);
    return item;
  }

  // Atomically claim a driver for a trip. Mirrors the conditional update
  // `attribute_exists(driver_id) AND status = available AND ttl > now`.
  tryMarkBusy(cell: string, driverId: string, tripId: string, now: number): boolean {
    this.claimAttempts += 1;
    const item = this.cells.get(cell)?.get(driverId);
    if (!item || item.status !== 'available' || !(item.ttl > now)) return false;
    item.status = 'busy';
    item.tripId = tripId;
    this.claimsWon += 1;
    return true;
  }

  setStatus(driverId: string, status: DriverStatus): void {
    const item = this.byDriver.get(driverId);
    if (!item) return;
    item.status = status;
    if (status !== 'busy') item.tripId = null;
  }

  getDriver(driverId: string): PositionItem | null {
    return this.byDriver.get(driverId) ?? null;
  }

  all(): PositionItem[] {
    return [...this.byDriver.values()];
  }

  // Read one partition, dropping expired rows and rows outside the subcell filter.
  queryCell(cell: string, now: number, subcells: string[] | null): PositionItem[] {
    const partition = this.cells.get(cell);
    if (!partition) return [];
    const out: PositionItem[] = [];
    for (const item of partition.values()) {
      if (!(item.ttl > now)) continue;
      if (subcells && !subcells.includes(item.geohash)) continue;
      out.push(item);
    }
    return out;
  }

  // Which partitions to read and which precision-6 subcells to keep. Small
  // radii enumerate the subcells covering the search box and group them by
  // their precision-5 parent; large radii read the 3x3 block unfiltered.
  queryPlan(lat: number, lng: number, radiusM: number): QueryPlanEntry[] {
    const precision = this.cellPrecision;
    const fine = precision + 1;
    const [latLo, lngLo] = offsetM(lat, lng, -radiusM, -radiusM);
    const [latHi, lngHi] = offsetM(lat, lng, radiusM, radiusM);
    const [cLatLo, cLatHi, cLngLo, cLngHi] = geohash.decodeBbox(geohash.encode(lat, lng, fine));
    const stepLat = (cLatHi - cLatLo) * 0.999;
    const stepLng = (cLngHi - cLngLo) * 0.999;

    const subcells: string[] = [];
    const seen = new Set<string>();
    for (let y = latLo; y <= latHi + stepLat; y += stepLat) {
      for (let x = lngLo; x <= lngHi + stepLng; x += stepLng) {
        const sub = geohash.encode(y, x, fine);
        if (!seen.has(sub)) {
          seen.add(sub);
          subcells.push(sub);
        }
      }
    }

    if (subcells.length > MAX_SUBCELL_FILTER) {
      const center = geohash.encode(lat, lng, precision);
      return geohash.cellWithNeighbors(center).map((cell) => ({ cell, subcells: null }));
    }

    const grouped = new Map<string, string[]>();
    for (const sub of subcells) {
      const parent = sub.slice(0, precision);
      const list = grouped.get(parent);
      if (list) list.push(sub);
      else grouped.set(parent, [sub]);
    }
    return [...grouped.entries()].map(([cell, subs]) => ({ cell, subcells: subs }));
  }

  // Drivers within radiusM of a point, nearest first, expired items excluded.
  nearby(
    lat: number,
    lng: number,
    radiusM: number,
    statuses: ReadonlySet<DriverStatus> | null,
    now: number,
  ): NearbyResult {
    const plan = this.queryPlan(lat, lng, radiusM);
    const found: NearbyDriver[] = [];
    let rowsRead = 0;
    for (const entry of plan) {
      const items = this.queryCell(entry.cell, now, entry.subcells);
      rowsRead += items.length;
      for (const item of items) {
        if (statuses && !statuses.has(item.status)) continue;
        const distanceM = haversineM(lat, lng, item.lat, item.lng);
        if (distanceM <= radiusM) {
          found.push({ ...item, distanceM: Math.round(distanceM * 10) / 10 });
        }
      }
    }
    found.sort((a, b) => a.distanceM - b.distanceM);
    return { drivers: found, plan, rowsRead };
  }
}
