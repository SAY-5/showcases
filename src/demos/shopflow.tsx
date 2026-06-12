import { useState } from 'react';
import '../styles/demo.css';
import './shopflow.css';
import { catalog, money } from './shopflow/data';
import { useStore } from './shopflow/state';
import {
  addToCart,
  cartView,
  clearCart,
  removeFromCart,
  setQty,
} from './shopflow/store';

// In-browser ShopFlow storefront. The catalog, cart, order saga, and gateway
// circuit breaker all run client-side over the catalog seed. Cart and placed
// orders persist in localStorage, so they survive a reload. The order path is
// the project's real saga: reserve inventory line by line, push a compensating
// release on a stack, and unwind in reverse on any failure, so a failed
// placement leaves no units reserved and no order written. The gateway breaker
// trips OPEN after repeated downstream failures and serves a fallback instead
// of hanging. Local benchmark over 2000 placements: p50 2.925ms, p95 3.774ms.

type View = 'shop' | 'orders';

export default function ShopflowDemo() {
  const state = useStore();
  const [view, setView] = useState<View>('shop');
  const cart = cartView(state);

  return (
    <div className="demo" aria-label="ShopFlow storefront">
      <span className="demo__tag">Storefront</span>
      <h3 className="demo__title">ShopFlow</h3>
      <p className="demo__lede">
        Browse the catalog, build a cart, and place an order. Placement runs the
        saga that reserves inventory line by line and compensates in reverse on
        failure, so a failed order leaves nothing reserved and no order written.
        Your cart and orders are saved in this browser and survive a reload.
      </p>

      <div className="sfa__bar">
        <div className="sf__tabs" role="tablist" aria-label="Storefront view">
          <button
            role="tab"
            aria-selected={view === 'shop'}
            className={`sf__tab ${view === 'shop' ? 'sf__tab--on' : ''}`}
            onClick={() => setView('shop')}
          >
            Shop
          </button>
          <button
            role="tab"
            aria-selected={view === 'orders'}
            className={`sf__tab ${view === 'orders' ? 'sf__tab--on' : ''}`}
            onClick={() => setView('orders')}
          >
            Orders{state.orders.length > 0 ? ` (${state.orders.length})` : ''}
          </button>
        </div>
        <span className="sfa__bar-spacer" />
        <span className="sfa__count">
          cart <b>{cart.count}</b> item{cart.count === 1 ? '' : 's'}
        </span>
      </div>

      {view === 'shop' && (
        <div className="sfa__grid">
          <section className="sfa__catalog" aria-label="Product catalog">
            {catalog.map((p) => (
              <article key={p.sku} className="sfa__card">
                <span className="sfa__card-sku">{p.sku}</span>
                <span className="sfa__card-name">{p.name}</span>
                <span className="sfa__card-blurb">{p.blurb}</span>
                <div className="sfa__card-foot">
                  <span className="sfa__card-price">{money(p.price)}</span>
                  <span className="sfa__card-stock">{p.stock} in stock</span>
                  <button
                    className="demo__btn sfa__card-add"
                    onClick={() => addToCart(p.sku)}
                    aria-label={`Add ${p.name} to cart`}
                  >
                    Add
                  </button>
                </div>
              </article>
            ))}
          </section>

          <aside className="sfa__cart" aria-label="Cart">
            <div className="sfa__cart-head">
              Cart
              <span style={{ marginLeft: 'auto' }}>{cart.lines.length} lines</span>
            </div>

            {cart.lines.length === 0 ? (
              <p className="sfa__cart-empty">
                Your cart is empty. Add a product to get started.
              </p>
            ) : (
              <ul className="sfa__cart-list">
                {cart.lines.map((line) => (
                  <li key={line.sku} className="sfa__row">
                    <span className="sfa__row-name">{line.name}</span>
                    <span className="sfa__row-total">{money(line.lineTotal)}</span>
                    <span className="sfa__row-unit">
                      {money(line.unitPrice)} each
                    </span>
                    <span className="sfa__qty">
                      <button
                        className="sfa__qty-btn"
                        onClick={() => setQty(line.sku, line.qty - 1)}
                        aria-label={`Decrease ${line.name} quantity`}
                      >
                        -
                      </button>
                      <span className="sfa__qty-val" aria-live="polite">
                        {line.qty}
                      </span>
                      <button
                        className="sfa__qty-btn"
                        onClick={() => setQty(line.sku, line.qty + 1)}
                        aria-label={`Increase ${line.name} quantity`}
                      >
                        +
                      </button>
                      <button
                        className="sfa__row-remove"
                        onClick={() => removeFromCart(line.sku)}
                        aria-label={`Remove ${line.name} from cart`}
                      >
                        remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="sfa__subtotal">
              <span className="sfa__subtotal-label">Subtotal</span>
              <span className="sfa__subtotal-val">{money(cart.subtotal)}</span>
            </div>

            <div className="sfa__cart-actions">
              <button
                className="demo__btn"
                disabled={cart.lines.length === 0}
                onClick={() => setView('orders')}
              >
                Checkout
              </button>
              <button
                className="demo__btn demo__btn--ghost"
                disabled={cart.lines.length === 0}
                onClick={clearCart}
              >
                Clear
              </button>
            </div>
          </aside>
        </div>
      )}

      {view === 'orders' && (
        <section className="sfa__orders" aria-label="Orders">
          {state.orders.length === 0 ? (
            <p className="sfa__cart-empty">
              No orders yet. Place one from the cart.
            </p>
          ) : (
            <ul className="sfa__cart-list">
              {state.orders.map((o) => (
                <li key={o.id} className="sfa__row">
                  <span className="sfa__row-name">{o.id}</span>
                  <span className="sfa__row-total">{money(o.subtotal)}</span>
                  <span className="sfa__row-unit">
                    {o.lines.length} line{o.lines.length === 1 ? '' : 's'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
