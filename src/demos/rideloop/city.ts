// A small synthetic city: a square road grid centered on one coordinate.
// Port of sim/city.py.
import { EARTH_RADIUS_M, offsetM } from './geo';
import type { Rng } from './prng';

export const CITY_CENTER: readonly [number, number] = [37.7749, -122.4194];
export const CITY_HALF_M = 3000;
export const BLOCK_M = 250;
export const DRIVER_SPEED_MPS = 11;

const HEADINGS: readonly number[] = [0, 90, 180, 270];

export function toLatLng(northM: number, eastM: number): [number, number] {
  return offsetM(CITY_CENTER[0], CITY_CENTER[1], northM, eastM);
}

export function randomPoint(rng: Rng): [number, number] {
  return toLatLng(rng.uniform(-CITY_HALF_M, CITY_HALF_M), rng.uniform(-CITY_HALF_M, CITY_HALF_M));
}

function snap(value: number): number {
  return Math.round(value / BLOCK_M) * BLOCK_M;
}

export function latLngToLocal(lat: number, lng: number): [number, number] {
  const rad = Math.PI / 180;
  const north = (lat - CITY_CENTER[0]) * rad * EARTH_RADIUS_M;
  const east = (lng - CITY_CENTER[1]) * rad * EARTH_RADIUS_M * Math.cos(CITY_CENTER[0] * rad);
  return [north, east];
}

// Drives along the grid; wanders randomly or heads for a target when given one.
export class SimDriver {
  northM = 0;
  eastM = 0;
  heading = 0;
  target: [number, number] | null = null;
  tripId: string | null = null;
  private turnAt = 0;

  readonly driverId: string;
  readonly rng: Rng;

  constructor(driverId: string, rng: Rng) {
    this.driverId = driverId;
    this.rng = rng;
  }

  static spawn(driverId: string, rng: Rng): SimDriver {
    const d = new SimDriver(driverId, rng);
    d.northM = snap(rng.uniform(-CITY_HALF_M, CITY_HALF_M));
    d.eastM = snap(rng.uniform(-CITY_HALF_M, CITY_HALF_M));
    d.heading = rng.choice(HEADINGS);
    d.turnAt = d.nextTurn();
    return d;
  }

  private nextTurn(): number {
    return this.rng.choice([BLOCK_M, 2 * BLOCK_M, 3 * BLOCK_M]);
  }

  setTarget(northM: number, eastM: number): void {
    this.target = [northM, eastM];
  }

  clearTarget(): void {
    this.target = null;
  }

  private steer(): void {
    if (this.target !== null) {
      const dn = this.target[0] - this.northM;
      const de = this.target[1] - this.eastM;
      if (Math.abs(dn) < 1 && Math.abs(de) < 1) return;
      if (Math.abs(dn) >= Math.abs(de)) this.heading = dn > 0 ? 0 : 180;
      else this.heading = de > 0 ? 90 : 270;
      return;
    }
    if (this.turnAt <= 0) {
      this.heading = this.rng.choice(HEADINGS);
      this.turnAt = this.nextTurn();
    }
    if (Math.abs(this.northM) >= CITY_HALF_M && (this.heading === 0 || this.heading === 180)) {
      this.heading = this.northM > 0 ? 180 : 0;
    }
    if (Math.abs(this.eastM) >= CITY_HALF_M && (this.heading === 90 || this.heading === 270)) {
      this.heading = this.eastM > 0 ? 270 : 90;
    }
  }

  step(dtS: number): void {
    this.steer();
    const dist = DRIVER_SPEED_MPS * dtS;
    if (this.target !== null) {
      const dn = this.target[0] - this.northM;
      const de = this.target[1] - this.eastM;
      if (Math.hypot(dn, de) <= dist) {
        [this.northM, this.eastM] = this.target;
        return;
      }
    }
    const rad = (this.heading * Math.PI) / 180;
    this.northM += Math.cos(rad) * dist;
    this.eastM += Math.sin(rad) * dist;
    this.northM = Math.max(-CITY_HALF_M, Math.min(CITY_HALF_M, this.northM));
    this.eastM = Math.max(-CITY_HALF_M, Math.min(CITY_HALF_M, this.eastM));
    this.turnAt -= dist;
  }

  latlng(): [number, number] {
    return toLatLng(this.northM, this.eastM);
  }
}
