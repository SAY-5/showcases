import type { ProjectData } from './types';
import { categories } from '../data/projects';

// One block per showcase, laid out COLS wide; the row count follows the list.
export const COLS = 17;

// World units. Blocks are CELL wide with GAP of graphite between them.
export const CELL = 1;
export const GAP = 0.16;

const MIN_HEIGHT = 0.3;
const HEIGHT_RANGE = 1.0;
const MAX_SCORE = 9;

// Bands run in the same order the site lists categories.
export const CATEGORY_ORDER: readonly string[] = categories;

export type ClusterCell = {
  index: number;
  name: string;
  title: string;
  category: string;
  language: string;
  col: number;
  row: number;
  height: number;
  lit: boolean;
};

function categoryRank(category: string): number {
  const i = CATEGORY_ORDER.indexOf(category);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

export function sortForCluster(list: readonly ProjectData[]): ProjectData[] {
  return [...list].sort(
    (a, b) =>
      categoryRank(a.category) - categoryRank(b.category) ||
      b.flagshipScore - a.flagshipScore ||
      a.name.localeCompare(b.name),
  );
}

export function blockHeight(flagshipScore: number): number {
  const score = Math.min(MAX_SCORE, Math.max(0, flagshipScore));
  return MIN_HEIGHT + (score / MAX_SCORE) * HEIGHT_RANGE;
}

export function rowCount(cellCount: number): number {
  return Math.max(1, Math.ceil(cellCount / COLS));
}

export function buildCells(list: readonly ProjectData[]): ClusterCell[] {
  return sortForCluster(list).map((p, index) => ({
    index,
    name: p.name,
    title: p.title,
    category: p.category,
    language: p.language,
    col: index % COLS,
    row: Math.floor(index / COLS),
    height: blockHeight(p.flagshipScore),
    lit: p.isFlagship,
  }));
}

// Slab is centered on the origin; x runs along columns, z along rows.
export function cellPosition(
  cell: ClusterCell,
  rows: number,
): [number, number, number] {
  const x = (cell.col - (COLS - 1) / 2) * CELL;
  const z = (cell.row - (rows - 1) / 2) * CELL;
  return [x, cell.height / 2, z];
}
