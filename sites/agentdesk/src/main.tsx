import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Showcase } from '@showcases/showcase';
import '@showcases/showcase/theme.css';
import { data } from './data';
import Demo from './demo';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Showcase data={data} Demo={Demo} />
  </StrictMode>
);
