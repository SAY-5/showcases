import type { ProjectData } from '@showcases/showcase';

export const data: ProjectData = {
  "name": "codelens",
  "title": "codelens",
  "tagline": "Go AST code-intelligence tool with a symbol and reference graph",
  "summary": "codelens parses a Go source tree into a symbol graph and a reference graph, stores them in Postgres, and serves a GraphQL API that a React browser uses for jump-to-definition and find-references. An indexer binary builds definitions, references, and call edges, while a Python sidecar ranks related symbols behind a pluggable provider seam. The find-references hot path was optimized with a covering index and single join.",
  "category": "Developer Tools",
  "stack": [
    "Go",
    "GraphQL",
    "Postgres",
    "Redis",
    "React",
    "TypeScript",
    "Python",
    "FastAPI"
  ],
  "highlights": [
    "Optimized find-references path: p95 dropped from 915.3 ms (N+1 baseline) to 17.6 ms with a covering index and single join",
    "Benchmarked over a seeded graph of 8000 files, 5000 symbols, and 2000 references per symbol (about 10M reference rows)",
    "Composite index on refs (symbol_id, file_id) with INCLUDE lets Postgres answer from the index without heap fetches",
    "CI bench-regress gate fails if the fast path drifts to within 30% of the slow baseline, guarding against a lost index or reintroduced N+1"
  ],
  "demoConcept": "Visualize a clickable symbol graph where selecting a node animates jump-to-definition edges and fans out every reference across files, with a side-by-side timer showing the N+1 baseline versus the indexed query."
};
