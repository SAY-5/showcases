import { Link } from 'react-router-dom';
import type { CSSProperties } from 'react';
import type { ProjectData } from '../showcase/types';

type Props = {
  project: ProjectData;
  number: number;
  animIndex?: number;
};

const pad = (n: number) => String(n).padStart(3, '0');

export function ProjectRow({ project, number, animIndex = 0 }: Props) {
  const style = { '--i': Math.min(animIndex, 14) } as CSSProperties;
  return (
    <li className="row" style={style}>
      <Link to={`/${project.name}`} className="row__link">
        <span className="row__idx mono num" aria-hidden="true">
          {pad(number)}
        </span>
        <span className="row__main">
          <span className="row__title">
            {project.title}
            {project.isFlagship && (
              <span
                className="row__flag"
                title="Selected work"
                aria-label="Selected work"
              />
            )}
          </span>
          <span className="row__tagline">{project.tagline}</span>
        </span>
        <span className="row__meta">
          <span className="row__lang">{project.language}</span>
          <span className="row__cat">{project.category}</span>
        </span>
      </Link>
    </li>
  );
}
