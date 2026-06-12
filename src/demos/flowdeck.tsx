// FlowDeck: a working multi-step approval workflow engine that runs entirely in
// the browser. Submit a request, watch it advance through manager, finance, and
// security gates, approve or reject the current step with a note, and see where
// every item is stuck. The workflow definition, items, and audit trail live in
// localStorage; the pure engine decides every transition.

import { useEffect, useMemo, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import './flowdeck.css';

import { useFlowStore } from './flowdeck/state';
import { ROLES, setActingAs, submitItem } from './flowdeck/store';
import { bucketByStep, stepApplies } from './flowdeck/engine';
import { age, fieldText } from './flowdeck/format';
import type { Item, Role } from './flowdeck/types';

const ease = [0.22, 1, 0.36, 1] as const;

// A re-rendering clock so relative ages stay fresh without calling Date.now
// during render. Initialised lazily, then ticked once a minute.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export default function FlowdeckDemo() {
  const { workflow, items, actingAs } = useFlowStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const now = useNow();

  const { buckets, completed } = useMemo(
    () => bucketByStep(workflow, items),
    [workflow, items],
  );

  return (
    <div className="demo fd2" aria-label="flowdeck approval workflow">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Run an approval workflow end to end</h3>
      <p className="demo__lede">
        Submit a request and it enters the pipeline at the first gate that
        applies. Pick the role you are acting as, then approve or reject the
        step in front of you. Finance only sees larger requests, security only
        sees access changes, and a rejection sends the item back.
      </p>

      <RoleBar actingAs={actingAs} />

      <SubmitForm />

      <section className="fd2__pipeline" aria-label="workflow pipeline">
        {buckets.map((bucket) => (
          <PipelineColumn
            key={bucket.step.id}
            heading={bucket.step.name}
            sub={bucket.step.approver}
            items={bucket.items}
            now={now}
            selectedId={selectedId}
            onSelect={setSelectedId}
            active={bucket.step.approver === actingAs}
          />
        ))}
        <PipelineColumn
          heading="Approved"
          sub="done"
          items={completed}
          now={now}
          selectedId={selectedId}
          onSelect={setSelectedId}
          terminal
        />
      </section>
    </div>
  );
}

function RoleBar({ actingAs }: { actingAs: Role }) {
  return (
    <div className="fd2__roles" role="radiogroup" aria-label="acting as role">
      <span className="fd2__roles-label">acting as</span>
      {ROLES.map((r) => (
        <button
          key={r.id}
          type="button"
          role="radio"
          aria-checked={actingAs === r.id}
          className="fd2__role"
          data-on={actingAs === r.id}
          onClick={() => setActingAs(r.id)}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

function SubmitForm() {
  const { workflow } = useFlowStore();
  const reduce = useReducedMotion();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('250');
  const [accessChange, setAccessChange] = useState(false);

  const preview = useMemo(() => {
    const fields = { amount: Number(amount) || 0, accessChange };
    return workflow.steps.filter((s) => stepApplies(s, fields)).map((s) => s.name);
  }, [workflow, amount, accessChange]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = submitItem(title, { amount: Number(amount) || 0, accessChange });
    if (ok) {
      setTitle('');
      setAmount('250');
      setAccessChange(false);
    }
  }

  return (
    <form className="fd2__submit glass" onSubmit={onSubmit} aria-label="submit a request">
      <div className="fd2__field fd2__field--grow">
        <label htmlFor="fd2-title">Request</label>
        <input
          id="fd2-title"
          type="text"
          value={title}
          placeholder="What needs approval?"
          onChange={(e) => setTitle(e.target.value)}
          required
        />
      </div>
      <div className="fd2__field">
        <label htmlFor="fd2-amount">Amount</label>
        <input
          id="fd2-amount"
          type="number"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="fd2__field fd2__field--check">
        <label htmlFor="fd2-access">
          <input
            id="fd2-access"
            type="checkbox"
            checked={accessChange}
            onChange={(e) => setAccessChange(e.target.checked)}
          />
          Access change
        </label>
      </div>
      <button type="submit" className="demo__btn">
        Submit
      </button>
      <motion.p
        className="fd2__route"
        key={preview.join('>')}
        initial={{ opacity: reduce ? 1 : 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: reduce ? 0 : 0.25, ease }}
      >
        route: {preview.length ? preview.join(' → ') : 'no gates, auto-approved'}
      </motion.p>
    </form>
  );
}

function PipelineColumn({
  heading,
  sub,
  items,
  now,
  selectedId,
  onSelect,
  active = false,
  terminal = false,
}: {
  heading: string;
  sub: string;
  items: Item[];
  now: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  active?: boolean;
  terminal?: boolean;
}) {
  return (
    <div className="fd2__col" data-active={active} data-terminal={terminal}>
      <header className="fd2__col-head">
        <span className="fd2__col-name">{heading}</span>
        <span className="fd2__col-sub">{sub}</span>
        <span className="fd2__col-count" aria-label={`${items.length} items`}>
          {items.length}
        </span>
      </header>
      <ul className="fd2__col-list">
        {items.length === 0 && <li className="fd2__col-empty">empty</li>}
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="fd2__card"
              data-selected={selectedId === item.id}
              onClick={() => onSelect(item.id)}
            >
              <span className="fd2__card-title">{item.title}</span>
              <span className="fd2__card-meta">
                <span className="fd2__card-id">{item.id}</span>
                <span className="fd2__card-age">{age(item.submittedAt, now)}</span>
              </span>
              <span className="fd2__card-amount">
                {fieldText(item.fields.amount ?? 0)}
                {item.fields.accessChange ? ' · access' : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
