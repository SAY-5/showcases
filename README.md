# showcases

One single-page app that serves a standalone showcase for every project at its
own route. It builds to a single `dist` and deploys once. After deploy, a
project's site is `<deploy-url>/<name>` (for example `<deploy-url>/codelens`).

## Layout

```
src/showcase/        shared Showcase template, theme tokens, and ProjectData type
src/demos/           the interactive demo component for each project, plus its css
src/styles/demo.css  shared demo styles used by the original demos
src/data/projects.ts the full dataset of all projects as typed objects
src/pages/           index grid, per-project showcase page, and not-found page
src/App.tsx          the route table
src/main.tsx         app entry, mounts the router and global styles
```

## Routes

- `/` renders an index grid of every project, linking to `/<name>`.
- `/:name` renders the full standalone showcase for that project: the shared
  template with the project's dataset entry and its demo as the centerpiece.
- any other path renders a not-found page that links back to `/`.

Demos are loaded with `import.meta.glob('./demos/*.tsx', { eager: true })`,
keyed by file basename, which matches the project name in the dataset.

## Develop

```
npm install
npm run dev
```

## Build

```
npm install
npm run build
```

The output is a single `dist`. `npm run lint` checks the whole tree.

## Deploy

The app deploys once to one URL with Vercel. From the repository root:

```
vercel deploy --prod
```

The included `vercel.json` rewrites every path to `index.html` so deep links
like `/<name>` resolve to the app.

## License

MIT
