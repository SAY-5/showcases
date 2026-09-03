// The dispatch matcher: pairs a requested trip with the nearest available
// driver. Port of services/dispatch/matcher.py with a step-by-step trace so
// the UI can replay the search ring by ring and claim by claim.
import type { NearbyDriver, PositionIndex, QueryPlanEntry } from './positions';

const AVAILABLE = new Set<'available'>(['available']);

// 500, 1000, 2000, 4000: double until the cap, always ending at the cap.
export function expandingRadii(initialM: number, maxM: number): number[] {
  const radii: number[] = [];
  let radius = initialM;
  while (radius < maxM) {
    radii.push(radius);
    radius *= 2;
  }
  radii.push(maxM);
  return radii;
}

export const DEFAULT_RADII = expandingRadii(500, 4000);

export interface MatchOutcome {
  tripId: string;
  driver: NearbyDriver | null;
  radiusM: number | null;
  candidatesSeen: number;
  partitionReads: number;
  claimAttempts: number;
}

export type MatchStep =
  | { kind: 'query'; radiusM: number; candidates: NearbyDriver[]; plan: QueryPlanEntry[] }
  | { kind: 'claim'; radiusM: number; driver: NearbyDriver; ok: boolean }
  | { kind: 'widen'; fromM: number; toM: number };

// Widen the search ring until a driver is claimed or the cap is reached.
// Yields after every query and every claim so two searches can be
// interleaved to show contention for one driver.
export function* matchSteps(
  index: PositionIndex,
  lat: number,
  lng: number,
  tripId: string,
  now: number,
  radii: readonly number[] = DEFAULT_RADII,
): Generator<MatchStep, MatchOutcome, void> {
  let seen = 0;
  let partitionReads = 0;
  let claimAttempts = 0;
  const tried = new Set<string>();
  for (let r = 0; r < radii.length; r++) {
    const radius = radii[r];
    if (r > 0) yield { kind: 'widen', fromM: radii[r - 1], toM: radius };
    const { drivers, plan } = index.nearby(lat, lng, radius, AVAILABLE, now);
    partitionReads += plan.length;
    yield { kind: 'query', radiusM: radius, candidates: drivers, plan };
    for (const candidate of drivers) {
      if (tried.has(candidate.driverId)) continue;
      tried.add(candidate.driverId);
      seen += 1;
      claimAttempts += 1;
      const ok = index.tryMarkBusy(candidate.cell, candidate.driverId, tripId, now);
      yield { kind: 'claim', radiusM: radius, driver: candidate, ok };
      if (ok) {
        return { tripId, driver: candidate, radiusM: radius, candidatesSeen: seen, partitionReads, claimAttempts };
      }
    }
  }
  return { tripId, driver: null, radiusM: null, candidatesSeen: seen, partitionReads, claimAttempts };
}

// Run the search to completion in one go.
export function findDriver(
  index: PositionIndex,
  lat: number,
  lng: number,
  tripId: string,
  now: number,
  radii: readonly number[] = DEFAULT_RADII,
): MatchOutcome {
  const gen = matchSteps(index, lat, lng, tripId, now, radii);
  for (;;) {
    const next = gen.next();
    if (next.done) return next.value;
  }
}
