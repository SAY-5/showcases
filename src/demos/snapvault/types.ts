// Shared types for the in-browser snapvault pipeline.

export type VFile = {
  path: string;
  blocks: string[]; // content blocks; each block becomes one chunk ref
};

export type ChunkRef = {
  hash: string; // content address (hex)
  path: string;
  index: number; // position within the file
};

export type SnapshotStats = {
  name: 'v1' | 'v2';
  files: number;
  chunkRefs: number;
  newChunks: number;
  deduped: number;
};

export type Snapshot = {
  stats: SnapshotStats;
  refs: ChunkRef[]; // every ref, in file order
  uniqueHashes: string[]; // first-seen order across the whole store
};

export type Placement = Record<string, number[]>; // hash -> replica node ids

// One chunk's fate during a restore.
export type RestoreItem = {
  hash: string;
  replicas: number[];
  fetchedFrom: number | null; // null when every replica is down
  verified: boolean;
};

export type RestorePlan = {
  items: RestoreItem[];
  missing: RestoreItem[];
  intact: boolean; // reassembled tree matches the original byte-for-byte
};
