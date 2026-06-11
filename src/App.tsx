import { Routes, Route } from 'react-router-dom';
import { IndexPage } from './pages/IndexPage';
import { ProjectPage } from './pages/ProjectPage';
import { NotFound } from './pages/NotFound';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<IndexPage />} />
      <Route path="/:name" element={<ProjectPage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
