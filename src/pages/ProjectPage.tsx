import { useParams } from 'react-router-dom';
import { Showcase } from '../showcase';
import { projectByName } from '../data/projects';
import { demoByName } from '../demos/registry';
import { NotFound } from './NotFound';

export function ProjectPage() {
  const { name = '' } = useParams();
  const data = projectByName[name];
  const Demo = demoByName[name];

  if (!data || !Demo) {
    return <NotFound />;
  }

  return <Showcase data={data} Demo={Demo} homeHref="/" />;
}
