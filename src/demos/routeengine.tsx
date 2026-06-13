import { useMemo, useState } from 'react';
import '../styles/demo.css';
import './routeengine.css';
import { useStore } from './routeengine/state';
import { addStop, moveDepot } from './routeengine/store';
import { DEPOT_ID, GRID_MAX, type Route, type Stop } from './routeengine/types';

// In-browser delivery route planner. A depot and a set of stops live on a
// 0..100 grid in localStorage. The safe engine builds a Euclidean distance
// matrix, a nearest-neighbour tour from the depot through every stop and back,
// and a 2-opt improvement pass. The map below draws the depot, the stops, and
// the current route as an ordered polyline. Everything is deterministic and
// runs client-side; there is no eval and no network.

const VIEW = 100; // SVG user units span the full 0..100 grid.

// Resolve a stop or depot id to its grid coordinates for drawing.
function pointOf(id: string, depot: { x: number; y: number }, stops: Stop[]) {
  if (id === DEPOT_ID) return depot;
  return stops.find((s) => s.id === id) ?? depot;
}

// Build the SVG polyline points string for a route order, closing the loop back
// to the depot.
function polylinePoints(
  route: Route,
  depot: { x: number; y: number },
  stops: Stop[],
): string {
  if (route.order.length === 0) return '';
  return route.order
    .concat(route.order[0])
    .map((id) => {
      const p = pointOf(id, depot, stops);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export default function RouteengineDemo() {
  const { depot, stops, route } = useStore();
  // Click mode: dropping a new stop or moving the depot.
  const [mode, setMode] = useState<'stop' | 'depot'>('stop');

  const points = useMemo(
    () => polylinePoints(route, depot, stops),
    [route, depot, stops],
  );

  // Map a click in the SVG to grid coordinates and apply the active mode.
  function handleMapClick(event: React.MouseEvent<SVGSVGElement>) {
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * GRID_MAX;
    const y = ((event.clientY - rect.top) / rect.height) * GRID_MAX;
    if (mode === 'depot') moveDepot(x, y);
    else addStop(x, y);
  }

  // Visit index per stop id, for labelling markers in route order.
  const visitOrder = useMemo(() => {
    const map = new Map<string, number>();
    let n = 0;
    for (const id of route.order) {
      if (id !== DEPOT_ID) map.set(id, ++n);
    }
    return map;
  }, [route.order]);

  return (
    <section className="re" aria-label="Delivery route planner">
      <header className="re__head">
        <h2 className="re__title">RouteEngine</h2>
        <p className="re__sub">
          Place stops, then optimize the round trip from the depot with
          nearest-neighbour and a 2-opt pass.
        </p>
      </header>

      <div className="re__stage">
        <div className="re__mapwrap glass">
          <div className="re__modes" role="group" aria-label="Map click mode">
            <button
              type="button"
              className={`re__mode${mode === 'stop' ? ' re__mode--on' : ''}`}
              aria-pressed={mode === 'stop'}
              onClick={() => setMode('stop')}
            >
              Add stop
            </button>
            <button
              type="button"
              className={`re__mode${mode === 'depot' ? ' re__mode--on' : ''}`}
              aria-pressed={mode === 'depot'}
              onClick={() => setMode('depot')}
            >
              Move depot
            </button>
          </div>

          <svg
            className="re__svg"
            viewBox={`0 0 ${VIEW} ${VIEW}`}
            role="img"
            aria-label={`Route map with ${stops.length} stops`}
            onClick={handleMapClick}
          >
            <defs>
              <pattern
                id="re-grid"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
              >
                <path d="M 10 0 L 0 0 0 10" className="re__gridline" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={VIEW} height={VIEW} fill="url(#re-grid)" />

            {points && <polyline className="re__path" points={points} />}

            {stops.map((s) => (
              <g key={s.id} className="re__stop">
                <circle cx={s.x} cy={s.y} r="2.6" className="re__stopdot" />
                <text x={s.x} y={s.y + 0.9} className="re__stoporder">
                  {visitOrder.get(s.id) ?? ''}
                </text>
              </g>
            ))}

            <g className="re__depot">
              <rect
                x={depot.x - 3}
                y={depot.y - 3}
                width="6"
                height="6"
                rx="1.2"
                className="re__depotbox"
              />
            </g>
          </svg>
          <p className="re__hint" aria-live="polite">
            Click the map to {mode === 'depot' ? 'move the depot' : 'add a stop'}.
          </p>
        </div>
      </div>
    </section>
  );
}
