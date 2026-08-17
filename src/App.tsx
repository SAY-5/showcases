import { Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import SiteHeader from './showcase/SiteHeader';
import SiteFooter from './showcase/SiteFooter';
import { IndexPage } from './pages/IndexPage';
import { ProjectPage } from './pages/ProjectPage';
import { NotFound } from './pages/NotFound';
import './showcase/layout.css';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export function App() {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollToTop />
      <SiteHeader />
      <main id="main">
        <Routes>
          <Route path="/" element={<IndexPage />} />
          <Route path="/:name" element={<ProjectPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <SiteFooter />
    </>
  );
}
