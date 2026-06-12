import { useState } from 'react';
import '../styles/demo.css';
import './payflow.css';
import { createPayment, useStore } from './payflow/store';
import { formatMoney, parseMajor } from './payflow/money';
import { CURRENCIES, type Currency, type IntentStatus } from './payflow/types';

// A working payment-orchestration app. A payment intent is created, then driven
// through authorize, capture, refund or void using only the transitions the
// engine permits. Everything persists to localStorage; no server is involved.

const STATUS_LABEL: Record<IntentStatus, string> = {
  created: 'Created',
  authorized: 'Authorized',
  captured: 'Captured',
  partially_refunded: 'Partially refunded',
  refunded: 'Refunded',
  voided: 'Voided',
  failed: 'Failed',
};

function StatusBadge({ status }: { status: IntentStatus }) {
  return (
    <span className={`pf-badge pf-badge--${status}`}>{STATUS_LABEL[status]}</span>
  );
}

function CreateForm({
  onCreate,
}: {
  onCreate: (amount: string, currency: Currency) => string | null;
}) {
  const [amount, setAmount] = useState('49.99');
  const [currency, setCurrency] = useState<Currency>('USD');
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = onCreate(amount, currency);
    setError(err);
    if (!err) setAmount('');
  }

  return (
    <form className="pf-form glass" onSubmit={submit} aria-label="Create payment">
      <h3 className="pf-form__title">New payment</h3>
      <div className="pf-form__row">
        <label className="pf-field">
          <span className="pf-field__label">Amount</span>
          <input
            className="pf-input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            aria-describedby={error ? 'pf-amount-err' : undefined}
          />
        </label>
        <label className="pf-field">
          <span className="pf-field__label">Currency</span>
          <select
            className="pf-input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as Currency)}
          >
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="demo__btn pf-form__submit">
          Create intent
        </button>
      </div>
      {error && (
        <p className="pf-form__error" id="pf-amount-err" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export default function PayflowDemo() {
  const { intents } = useStore();

  function handleCreate(amount: string, currency: Currency): string | null {
    // money.parseMajor is the only float bridge; reject anything it rejects.
    const minor = parseMajor(amount, currency);
    if (minor === null) return 'Enter a positive amount with valid decimals.';
    // Snapshot the clock at action time, never during render.
    const created = createPayment(minor, currency, Date.now());
    if (!created) return 'Could not create the payment intent.';
    return null;
  }

  return (
    <div className="demo" aria-label="PayFlow payment orchestration">
      <span className="demo__tag">Interactive app</span>
      <h3 className="demo__title">PayFlow payment orchestration</h3>
      <p className="demo__lede">
        Create a payment intent, then move it through authorize, capture, refund
        and void using only the transitions the state machine allows. Every
        action is recorded to an immutable event log in your browser.
      </p>

      <CreateForm onCreate={handleCreate} />

      <section className="pf-list" aria-label="Payment intents">
        <div className="pf-list__head">
          <h3 className="pf-list__title">Intents</h3>
          <span className="pf-list__count">{intents.length} total</span>
        </div>
        {intents.length === 0 ? (
          <p className="pf-list__empty">No payments yet. Create one above.</p>
        ) : (
          <ul className="pf-list__items">
            {intents.map((it) => (
              <li key={it.id} className="pf-row glass">
                <span className="pf-row__id mono">{it.id}</span>
                <span className="pf-row__amount mono">
                  {formatMoney(it.amount, it.currency)}
                </span>
                <StatusBadge status={it.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
