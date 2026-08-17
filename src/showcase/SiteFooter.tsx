import { Link } from 'react-router-dom';
import GitHubIcon from './GitHubIcon';
import { PORTFOLIO_URL, GITHUB_URL } from './links';

export default function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="site-footer">
      <div className="wrap site-footer__inner">
        <div>
          <p className="site-footer__name">Sai Asish Y</p>
          <p className="site-footer__line">
            Every page here runs its demo in the browser. The write-ups live on
            the portfolio.
          </p>
        </div>
        <div className="site-footer__right">
          <a href={PORTFOLIO_URL}>sayportfolio.vercel.app</a>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer">
            <GitHubIcon size={13} /> github.com/SAY-5
          </a>
          <Link to="/">Index</Link>
          <span className="site-footer__meta">&copy; {year} Sai Asish Y</span>
        </div>
      </div>
    </footer>
  );
}
