# showcases

Standalone single-page demo sites, one per project. Each site has its own
build and its own deploy URL. They share a single template and one set of
dependencies.

## Layout

```
packages/showcase/   shared Showcase component, theme, and ProjectData type
sites/<name>/        a thin Vite app for one project
scripts/generate.mjs scaffolds sites/<name>/ from the dataset
scripts/build-all.mjs builds every site (used by CI)
```

This is an npm workspaces monorepo, so there is one `node_modules` at the root
and every site links to the shared `@showcases/showcase` package.

## A site

Each `sites/<name>/` is a small Vite app:

- `index.html` and `vite.config.ts` (base `/`)
- `src/main.tsx` renders `<Showcase data={data} Demo={Demo} />`
- `src/demo.tsx` the interactive demo for this project
- `src/data.ts` the project's dataset entry as a typed object
- `vercel.json` an SPA rewrite

It builds on its own to its own `dist`.

## Add a site

The generator reads the dataset and writes a `sites/<name>/` from templates.

```
npm run generate -- <name>
```

You can pass several names at once. Re-running is safe; it overwrites the
generated files for those names.

## Build a site

```
npm install
npm --workspace sites/<name> run build
```

The output is `sites/<name>/dist`. To build every site at once:

```
npm run build:sites
```

## Deploy a site

Each site deploys to its own URL with Vercel. From the site directory:

```
cd sites/<name>
vercel deploy --prod
```

The included `vercel.json` handles the single-page rewrite.

## License

MIT
