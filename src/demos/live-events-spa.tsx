import { useMemo, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import '../styles/demo.css';
import './live-events-spa.css';
import {
  schedule,
  toggleAgenda,
  useAgendaIds,
} from './live-events-spa/store';
import {
  filterSessions,
  formatRange,
  groupByTrack,
  tagsOf,
  tracksOf,
} from './live-events-spa/engine';
import type { PlacedSession, ScheduleFilter } from './live-events-spa/types';

// In-browser conference scheduler. The full schedule is a fixed seed; the only
// persisted, mutable state is a personal agenda of saved session ids kept in
// localStorage. Everything else, filtering, grouping by track, conflict
// detection, and the now/next strip, runs through the pure engine so render
// stays deterministic with no Date.now in the render path. The current minute
// is held in component state and driven by an explicit control rather than the
// live clock, which keeps the view a pure function of its inputs.

type View = 'schedule' | 'agenda';

// Stable per-track accent assignment so a track keeps the same colour across
// the timeline and the agenda. Indexes wrap if more tracks are ever added.
const TRACK_ACCENTS = [
  'var(--accent)',
  'var(--magenta)',
  '#ffcf5c',
  '#3ddc91',
] as const;

function useTrackColor(): (track: string) => string {
  const order = useMemo(() => tracksOf(schedule), []);
  return (track: string) => {
    const i = order.indexOf(track);
    return TRACK_ACCENTS[(i < 0 ? 0 : i) % TRACK_ACCENTS.length];
  };
}

export default function LiveEventsSpaDemo() {
  const reduce = useReducedMotion();
  const savedIds = useAgendaIds();
  const [view, setView] = useState<View>('schedule');
  const [filter, setFilter] = useState<ScheduleFilter>({
    query: '',
    track: 'all',
    tag: 'all',
  });

  const trackColor = useTrackColor();
  const tracks = useMemo(() => tracksOf(schedule), []);
  const tags = useMemo(() => tagsOf(schedule), []);

  const visible = useMemo(() => filterSessions(schedule, filter), [filter]);
  const groups = useMemo(() => groupByTrack(visible), [visible]);
  const savedSet = useMemo(() => new Set(savedIds), [savedIds]);

  return (
    <div className="demo les" data-reduce={reduce ? 'true' : 'false'}>
      <span className="demo__tag">Conference Scheduler</span>
      <h3 className="demo__title">Live Events</h3>
      <p className="demo__lede">
        Browse the conference schedule by track, search and filter sessions,
        then build a personal agenda. Saved sessions persist in your browser and
        are checked for time conflicts.
      </p>

      <div className="les__tabs" role="tablist" aria-label="Scheduler views">
        <button
          type="button"
          role="tab"
          id="les-tab-schedule"
          aria-selected={view === 'schedule'}
          aria-controls="les-panel-schedule"
          className={`les__tab${view === 'schedule' ? ' les__tab--on' : ''}`}
          onClick={() => setView('schedule')}
        >
          Schedule
        </button>
        <button
          type="button"
          role="tab"
          id="les-tab-agenda"
          aria-selected={view === 'agenda'}
          aria-controls="les-panel-agenda"
          className={`les__tab${view === 'agenda' ? ' les__tab--on' : ''}`}
          onClick={() => setView('agenda')}
        >
          My Agenda
          {savedIds.length > 0 && (
            <span className="les__badge" aria-hidden="true">
              {savedIds.length}
            </span>
          )}
        </button>
      </div>

      {view === 'schedule' && (
        <section
          id="les-panel-schedule"
          role="tabpanel"
          aria-labelledby="les-tab-schedule"
          className="les__panel"
        >
          <ScheduleFilters
            filter={filter}
            tracks={tracks}
            tags={tags}
            onChange={setFilter}
            resultCount={visible.length}
          />
          <ScheduleTimeline
            groups={groups}
            savedSet={savedSet}
            trackColor={trackColor}
          />
        </section>
      )}
    </div>
  );
}

function ScheduleFilters({
  filter,
  tracks,
  tags,
  onChange,
  resultCount,
}: {
  filter: ScheduleFilter;
  tracks: string[];
  tags: string[];
  onChange: (f: ScheduleFilter) => void;
  resultCount: number;
}) {
  return (
    <div className="les__filters glass">
      <div className="les__field">
        <label htmlFor="les-search" className="les__label">
          Search
        </label>
        <input
          id="les-search"
          type="search"
          className="les__input"
          placeholder="title, speaker, room, tag"
          value={filter.query}
          onChange={(e) => onChange({ ...filter, query: e.target.value })}
        />
      </div>
      <div className="les__field">
        <label htmlFor="les-track" className="les__label">
          Track
        </label>
        <select
          id="les-track"
          className="les__select"
          value={filter.track}
          onChange={(e) =>
            onChange({
              ...filter,
              track: e.target.value as ScheduleFilter['track'],
            })
          }
        >
          <option value="all">All tracks</option>
          {tracks.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="les__field">
        <label htmlFor="les-tag" className="les__label">
          Tag
        </label>
        <select
          id="les-tag"
          className="les__select"
          value={filter.tag}
          onChange={(e) =>
            onChange({
              ...filter,
              tag: e.target.value as ScheduleFilter['tag'],
            })
          }
        >
          <option value="all">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <p className="les__count" aria-live="polite">
        {resultCount} session{resultCount === 1 ? '' : 's'}
      </p>
    </div>
  );
}

function ScheduleTimeline({
  groups,
  savedSet,
  trackColor,
}: {
  groups: { track: string; sessions: PlacedSession[] }[];
  savedSet: Set<string>;
  trackColor: (track: string) => string;
}) {
  const hasResults = groups.some((g) => g.sessions.length > 0);
  if (!hasResults) {
    return (
      <p className="les__empty" role="status">
        No sessions match these filters.
      </p>
    );
  }
  return (
    <div className="les__grid">
      {groups.map((g) => (
        <div className="les__col" key={g.track}>
          <h4 className="les__coltitle" style={{ color: trackColor(g.track) }}>
            {g.track}
          </h4>
          <ul className="les__list">
            {g.sessions.map((s) => (
              <li key={s.id}>
                <SessionCard
                  session={s}
                  saved={savedSet.has(s.id)}
                  accent={trackColor(s.track)}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function SessionCard({
  session,
  saved,
  accent,
}: {
  session: PlacedSession;
  saved: boolean;
  accent: string;
}) {
  return (
    <article className="les__card glass" style={{ borderLeftColor: accent }}>
      <p className="les__time">{formatRange(session)}</p>
      <h5 className="les__cardtitle">{session.title}</h5>
      <p className="les__cmeta">
        {session.speaker} · {session.room}
      </p>
      <ul className="les__tags" aria-label="Tags">
        {session.tags.map((t) => (
          <li className="les__pill" key={t}>
            {t}
          </li>
        ))}
      </ul>
      <button
        type="button"
        className={`les__add${saved ? ' les__add--on' : ''}`}
        aria-pressed={saved}
        onClick={() => toggleAgenda(session.id)}
      >
        {saved ? 'In my agenda' : 'Add to agenda'}
      </button>
    </article>
  );
}
