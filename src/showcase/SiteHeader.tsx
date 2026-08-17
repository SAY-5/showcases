import { NavLink, Link } from 'react-router-dom';
import GitHubIcon from './GitHubIcon';
import { PORTFOLIO_URL, GITHUB_URL } from './links';

export default function SiteHeader() {
  return (
    <header className="site-header">
      <div className="wrap site-header__inner">
        <Link to="/" className="brand" aria-label="Sai Asish Y, showcases index">
          <span className="brand__mark">SAY-5</span>
          <span className="brand__name">Sai Asish Y</span>
        </Link>
        <nav className="site-nav" aria-label="Primary">
          <a href={PORTFOLIO_URL}>Portfolio</a>
          <NavLink to="/" end>
            Showcases
          </NavLink>
          <a
            className="site-nav__gh"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
          >
            <GitHubIcon size={13} />
            <span className="site-nav__label">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
