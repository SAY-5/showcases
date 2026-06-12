import '../styles/demo.css';
import './subscription-portal.css';
import { useStore } from './subscription-portal/state';
import { findPlan, money, planTotalCents } from './subscription-portal/engine';
import { formatDate, statusLabel } from './subscription-portal/format';
import type { Invoice } from './subscription-portal/types';

const KIND_LABEL: Record<Invoice['kind'], string> = {
  signup: 'Signup',
  plan_change: 'Plan change',
  seat_change: 'Seat change',
  renewal: 'Renewal',
  pause: 'Pause',
  resume: 'Resume',
  cancel: 'Cancel',
  reactivate: 'Reactivate',
};

function Amount({ cents }: { cents: number }) {
  if (cents === 0) {
    return <span className="sp-amt sp-amt--zero">included</span>;
  }
  const credit = cents < 0;
  return (
    <span className={`sp-amt ${credit ? 'sp-amt--credit' : 'sp-amt--charge'}`}>
      {credit ? '-' : '+'}
      {money(Math.abs(cents))}
    </span>
  );
}

export default function SubscriptionPortalDemo() {
  const { sub, invoices } = useStore();
  const plan = findPlan(sub.planId);

  return (
    <div className="demo" aria-label="subscription self-service portal">
      <span className="demo__tag">Interactive demo</span>
      <h3 className="demo__title">Manage your subscription</h3>
      <p className="demo__lede">
        View your current plan, change tier or seats and preview the prorated
        amount, and pause, cancel, or reactivate. Every action posts an invoice
        line and persists in your browser.
      </p>

      <section className="sp-section" aria-labelledby="sp-overview-h">
        <h4 id="sp-overview-h" className="sp-section__title">
          Overview
        </h4>
        <div className="sp-overview">
          <article className="glass sp-card" aria-label="current plan">
            <div className="sp-card__head">
              <div>
                <span className="sp-card__eyebrow">Current plan</span>
                <h5 className="sp-card__plan">{plan ? plan.name : 'Unknown'}</h5>
              </div>
              <span className={`sp-status sp-status--${sub.status}`}>
                {statusLabel(sub.status)}
              </span>
            </div>

            <dl className="sp-meta">
              <div className="sp-meta__row">
                <dt>Price</dt>
                <dd>
                  {plan
                    ? `${money(planTotalCents(plan, sub.seats))} / ${plan.interval}`
                    : '-'}
                </dd>
              </div>
              <div className="sp-meta__row">
                <dt>Seats</dt>
                <dd>{sub.seats}</dd>
              </div>
              <div className="sp-meta__row">
                <dt>{sub.status === 'pending_cancel' ? 'Ends' : 'Renews'}</dt>
                <dd>
                  {sub.status === 'paused'
                    ? 'Paused'
                    : sub.status === 'canceled'
                      ? 'Ended'
                      : formatDate(sub.periodEnd)}
                </dd>
              </div>
              {plan ? (
                <div className="sp-meta__row">
                  <dt>Per seat</dt>
                  <dd>
                    {money(plan.priceCents)} / {plan.interval}
                  </dd>
                </div>
              ) : null}
            </dl>

            {plan ? (
              <ul className="sp-features" aria-label="plan features">
                {plan.features.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            ) : null}
          </article>

          <article className="glass sp-card" aria-label="invoice history">
            <div className="sp-card__head">
              <span className="sp-card__eyebrow">Invoice history</span>
            </div>
            <ul className="sp-invoices">
              {invoices.map((inv) => (
                <li key={inv.id} className="sp-invoice">
                  <div className="sp-invoice__main">
                    <span className={`sp-tagk sp-tagk--${inv.kind}`}>
                      {KIND_LABEL[inv.kind]}
                    </span>
                    <span className="sp-invoice__desc">{inv.description}</span>
                  </div>
                  <div className="sp-invoice__side">
                    <Amount cents={inv.amountCents} />
                    <time
                      className="sp-invoice__date"
                      dateTime={new Date(inv.at).toISOString()}
                    >
                      {formatDate(inv.at)}
                    </time>
                  </div>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </div>
  );
}
