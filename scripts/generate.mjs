// Scaffolds sites/<name>/ for each project name passed on the command line.
//
//   node scripts/generate.mjs codelens agentdesk taskboard
//
// For each name it:
//   - reads the project's entry from the dataset
//   - copies the project's demo component (and any co-located css) from demos/
//   - writes data.ts, main.tsx, demo wiring, index.html, vite.config.ts,
//     vercel.json, tsconfig.json, and package.json from templates
//
// Re-running overwrites the scaffolded files for those names, so it is safe to
// run again after the dataset or a demo changes.

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  readdirSync,
  copyFileSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const datasetPath =
  process.env.DATASET ?? join(root, 'scripts', 'dataset.json');
const demosDir = join(root, 'demos');

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const names = process.argv.slice(2).filter(Boolean);
if (names.length === 0) {
  fail('pass one or more project names, e.g. generate.mjs codelens');
}

if (!existsSync(datasetPath)) {
  fail(`dataset not found at ${datasetPath} (set DATASET to override)`);
}

const dataset = JSON.parse(readFileSync(datasetPath, 'utf8'));
const projects = Array.isArray(dataset) ? dataset : dataset.projects;
if (!Array.isArray(projects)) {
  fail('dataset must be an array or have a projects array');
}
const byName = new Map(projects.map((p) => [p.name, p]));

function findDemo(name) {
  // A demo lives at demos/<name>/demo.tsx, optionally with demo.css beside it.
  const dir = join(demosDir, name);
  const tsx = join(dir, 'demo.tsx');
  if (!existsSync(tsx)) return null;
  const extras = readdirSync(dir).filter(
    (f) => f !== 'demo.tsx' && (f.endsWith('.css') || f.endsWith('.ts'))
  );
  return { dir, tsx, extras };
}

function dataTs(p) {
  const entry = {
    name: p.name,
    title: p.title,
    tagline: p.tagline,
    summary: p.summary,
    category: p.category,
    stack: p.stack,
    highlights: p.highlights,
    demoConcept: p.demoConcept,
  };
  return (
    `import type { ProjectData } from '@showcases/showcase';\n\n` +
    `export const data: ProjectData = ${JSON.stringify(entry, null, 2)};\n`
  );
}

const mainTsx = `import { StrictMode } from 'react';
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
`;

function indexHtml(p) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${p.title}</title>
    <meta name="description" content="${p.tagline.replace(/"/g, '&quot;')}" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const viteConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/',
  plugins: [react()],
});
`;

const vercelJson = `{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
`;

const tsconfigJson = `{
  "extends": "../../tsconfig.json",
  "include": ["src"]
}
`;

function pkgJson(name) {
  return (
    JSON.stringify(
      {
        name: `@showcases/site-${name}`,
        private: true,
        version: '0.1.0',
        type: 'module',
        scripts: {
          dev: 'vite',
          build: 'vite build',
          preview: 'vite preview',
        },
        dependencies: {
          '@showcases/showcase': '*',
          'framer-motion': '^11.11.17',
          react: '^18.3.1',
          'react-dom': '^18.3.1',
        },
      },
      null,
      2
    ) + '\n'
  );
}

function write(path, contents) {
  writeFileSync(path, contents);
  console.log(`  wrote ${path.replace(root + '/', '')}`);
}

let made = 0;
for (const name of names) {
  const p = byName.get(name);
  if (!p) {
    console.error(`skip ${name}: not in dataset`);
    continue;
  }
  const demo = findDemo(name);
  if (!demo) {
    console.error(
      `skip ${name}: no demo at demos/${name}/demo.tsx (add one first)`
    );
    continue;
  }

  const siteDir = join(root, 'sites', name);
  const srcDir = join(siteDir, 'src');
  mkdirSync(srcDir, { recursive: true });

  write(join(siteDir, 'package.json'), pkgJson(name));
  write(join(siteDir, 'tsconfig.json'), tsconfigJson);
  write(join(siteDir, 'vite.config.ts'), viteConfig);
  write(join(siteDir, 'vercel.json'), vercelJson);
  write(join(siteDir, 'index.html'), indexHtml(p));
  write(join(srcDir, 'main.tsx'), mainTsx);
  write(join(srcDir, 'data.ts'), dataTs(p));

  copyFileSync(demo.tsx, join(srcDir, 'demo.tsx'));
  console.log(`  copied demos/${name}/demo.tsx -> sites/${name}/src/demo.tsx`);
  for (const extra of demo.extras) {
    copyFileSync(join(demo.dir, extra), join(srcDir, extra));
    console.log(`  copied demos/${name}/${extra} -> sites/${name}/src/${extra}`);
  }

  made += 1;
  console.log(`scaffolded sites/${name}`);
}

console.log(`\ndone: ${made} site(s)`);
