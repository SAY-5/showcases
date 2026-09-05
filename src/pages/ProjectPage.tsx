import { useParams } from 'react-router-dom';
import { Showcase } from '../showcase';
import { projects, projectByName } from '../data/projects';
import { demoByName } from '../demos/registry';
import { NotFound } from './NotFound';

export function ProjectPage() {
  const { name = '' } = useParams();
  const data = projectByName[name];
  const Demo = demoByName[name];

  if (!data || !Demo) {
    return <NotFound />;
  }

  const idx = projects.indexOf(data);
  const prev = idx > 0 ? projects[idx - 1] : null;
  const next = idx < projects.length - 1 ? projects[idx + 1] : null;

  return (
    <Showcase
      data={data}
      Demo={Demo}
      number={idx + 1}
      prev={prev}
      next={next}
      homeHref="/"
    />
  );
}
