import { Link } from 'react-router-dom';
import Arrow from '../showcase/Arrow';
import { PORTFOLIO_URL } from '../showcase/links';
import { useDocumentTitle } from '../showcase/useDocumentTitle';
import './NotFound.css';

export function NotFound() {
  useDocumentTitle('Not found');
  return (
    <section className="wrap notfound" aria-labelledby="nf-title">
      <h1 id="nf-title" className="notfound__title">
        <span className="notfound__code">404</span>
        <span className="notfound__text">Nothing at this address.</span>
      </h1>
      <p className="notfound__sub">Everything else is in the index.</p>
      <div className="notfound__links">
        <Link className="btn btn--solid" to="/">
          Open the index <Arrow className="btn__arrow" />
        </Link>
        <a className="tlink" href={PORTFOLIO_URL}>
          Portfolio
        </a>
      </div>
    </section>
  );
}
