import { Link } from 'react-router-dom';
import './NotFound.css';

export function NotFound() {
  return (
    <div className="nf">
      <span className="nf__code mono">404</span>
      <h1 className="nf__title">No showcase here</h1>
      <p className="nf__text">
        That project route does not exist. Head back to browse every demo.
      </p>
      <Link className="nf__link mono" to="/">
        Back to all projects
      </Link>
    </div>
  );
}
