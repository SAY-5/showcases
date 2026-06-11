import type { ComponentType } from 'react';

// Eagerly load every vendored demo component, keyed by its file basename.
// The basename matches the project name in the dataset, so a route like
// /codelens resolves to demos/codelens.tsx.
const modules = import.meta.glob<{ default: ComponentType }>('./*.tsx', {
  eager: true,
});

export const demoByName: Record<string, ComponentType> = {};

for (const path in modules) {
  const match = path.match(/\.\/(.+)\.tsx$/);
  if (!match) continue;
  const name = match[1];
  if (name === 'registry') continue;
  demoByName[name] = modules[path].default;
}
