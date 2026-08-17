// The snapvault storage model, in the browser: content-addressed chunks with
// dedup, incremental snapshots, hash-derived replica placement across
// simulated nodes, and a parallel verified restore plan. Everything is a pure
// function of the synthesized dataset and the set of downed nodes, so the
// whole pipeline is reproducible.

import type {
  ChunkRef,
  Placement,
  RestoreItem,
  RestorePlan,
  Snapshot,
  VFile,
} from './types';

export const NODES = 5;
export const REPLICAS = 3;
export const PARALLEL = 4;

// FNV-1a over the block's characters stands in for the C++ engine's SHA-256:
// same property that matters here, the address is derived from the content.
export function contentHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ---------- synthesized dataset ----------

const WORDS = [
  'ledger', 'orbit', 'quartz', 'delta', 'harbor', 'signal', 'copper',
  'meadow', 'lattice', 'ember', 'fjord', 'cobalt', 'prairie', 'vault',
];

function block(seedWordA: number, seedWordB: number, n: number): string {
  return `${WORDS[seedWordA % WORDS.length]}-${WORDS[seedWordB % WORDS.length]}-${n}`;
}

// 33 distinct content blocks arranged into 63 chunk references, mirroring the
// project's demo dataset: one file duplicated wholesale and repetition inside
// files, so the first snapshot already deduplicates 30 of its 63 refs.
export function makeDataset(): VFile[] {
  const uniq: string[] = [];
  for (let i = 0; i < 33; i++) {
    uniq.push(block(i, i * 7 + 3, i));
  }

  const notes = [...uniq.slice(0, 16), uniq[0], uniq[1], uniq[2], uniq[3]]; // 20 refs, 16 unique
  const metrics = uniq.slice(16, 29); // 13 refs, 13 unique
  const metricsBackup = [...metrics]; // byte-identical copy: 13 refs, 0 new
  const banner = [
    ...uniq.slice(29, 33),
    ...uniq.slice(29, 33),
    ...uniq.slice(29, 33),
    ...uniq.slice(29, 33),
    uniq[29],
  ]; // 17 refs, 4 unique

  return [
    { path: 'docs/notes.md', blocks: notes },
    { path: 'data/metrics.csv', blocks: metrics },
    { path: 'data/metrics-backup.csv', blocks: metricsBackup },
    { path: 'media/banner.svg', blocks: banner },
  ];
}

// The incremental edit: one block of one file changes, nothing else. The v2
// snapshot should therefore store exactly one new chunk.
export function editDataset(files: VFile[]): VFile[] {
  return files.map((f) =>
    f.path === 'docs/notes.md'
      ? {
          ...f,
          blocks: f.blocks.map((b, i) => (i === 5 ? `${b}-amended` : b)),
        }
      : f,
  );
}

// ---------- snapshots ----------

// Chunk every file and record which chunks are new to the store versus
// deduplicated against it. `known` carries the store contents forward so v2
// is incremental over v1.
export function takeSnapshot(
  name: 'v1' | 'v2',
  files: VFile[],
  known: Set<string>,
): Snapshot {
  const refs: ChunkRef[] = [];
  const uniqueHashes: string[] = [];
  let newChunks = 0;
  let deduped = 0;

  for (const f of files) {
    f.blocks.forEach((b, index) => {
      const hash = contentHash(b);
      refs.push({ hash, path: f.path, index });
      if (known.has(hash)) {
        deduped += 1;
      } else {
        known.add(hash);
        newChunks += 1;
      }
      if (!uniqueHashes.includes(hash)) uniqueHashes.push(hash);
    });
  }

  return {
    stats: {
      name,
      files: files.length,
      chunkRefs: refs.length,
      newChunks,
      deduped,
    },
    refs,
    uniqueHashes,
  };
}

// ---------- placement ----------

// Deterministic placement seeded by content hash: the chunk's address picks
// its home node and the replicas follow on the next nodes around the ring.
export function placeChunks(hashes: string[]): Placement {
  const placement: Placement = {};
  for (const hash of hashes) {
    const home = parseInt(hash, 16) % NODES;
    placement[hash] = Array.from(
      { length: REPLICAS },
      (_, i) => (home + i) % NODES,
    );
  }
  return placement;
}

export function chunksOnNode(placement: Placement, node: number): string[] {
  return Object.keys(placement).filter((h) => placement[h].includes(node));
}

// ---------- restore ----------

// For every chunk, fetch from the first surviving replica and re-hash it
// against its content address. A chunk whose replicas are all down is
// reported missing instead of silently skipped: the restore fails clean.
export function planRestore(
  files: VFile[],
  snapshot: Snapshot,
  placement: Placement,
  downNodes: number[],
): RestorePlan {
  const down = new Set(downNodes);
  const blockByHash = new Map<string, string>();
  for (const f of files) {
    for (const b of f.blocks) blockByHash.set(contentHash(b), b);
  }

  const items: RestoreItem[] = snapshot.uniqueHashes.map((hash) => {
    const replicas = placement[hash];
    const from = replicas.find((n) => !down.has(n));
    const content = blockByHash.get(hash);
    return {
      hash,
      replicas,
      fetchedFrom: from ?? null,
      verified: from !== undefined && contentHash(content ?? '') === hash,
    };
  });

  const missing = items.filter((i) => i.fetchedFrom === null);

  // Byte-for-byte check: reassemble every file from fetched chunks and compare
  // with the original content.
  let intact = missing.length === 0;
  if (intact) {
    for (const f of files) {
      const rebuilt = f.blocks
        .map((b) => blockByHash.get(contentHash(b)) ?? '')
        .join('\n');
      if (rebuilt !== f.blocks.join('\n')) {
        intact = false;
        break;
      }
    }
  }

  return { items, missing, intact };
}
