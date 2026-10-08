// ============================================================================
// pathfinder.ts — Lightweight grid-based A* pathfinding for the entity.
// Uses the maze grid directly. Returns a list of cell coordinates.
// ============================================================================

import type { MazeGrid } from './maze';

export type Path = [number, number][];

export function findPath(
  grid: MazeGrid,
  cols: number,
  rows: number,
  start: [number, number],
  goal: [number, number]
): Path {
  if (start[0] === goal[0] && start[1] === goal[1]) return [];
  if (grid[goal[1] * cols + goal[0]] === 1) return [];

  const idx = (x: number, y: number) => y * cols + x;
  const heuristic = (x: number, y: number) =>
    Math.abs(x - goal[0]) + Math.abs(y - goal[1]);

  const open: number[] = [idx(start[0], start[1])];
  const came = new Map<number, number>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  gScore.set(idx(start[0], start[1]), 0);
  fScore.set(idx(start[0], start[1]), heuristic(start[0], start[1]));

  const dirs = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  while (open.length) {
    // Find lowest fScore in open.
    let bestIdx = 0;
    let bestF = Infinity;
    for (let i = 0; i < open.length; i++) {
      const f = fScore.get(open[i]) ?? Infinity;
      if (f < bestF) {
        bestF = f;
        bestIdx = i;
      }
    }
    const current = open.splice(bestIdx, 1)[0];
    const cx = current % cols;
    const cy = Math.floor(current / cols);

    if (cx === goal[0] && cy === goal[1]) {
      // Reconstruct.
      const path: Path = [];
      let cur: number | undefined = current;
      while (cur !== undefined) {
        path.unshift([cur % cols, Math.floor(cur / cols)]);
        cur = came.get(cur);
      }
      return path.slice(1); // exclude start cell
    }

    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (grid[idx(nx, ny)] === 1) continue;
      const nIdx = idx(nx, ny);
      const tentG = (gScore.get(current) ?? Infinity) + 1;
      if (tentG < (gScore.get(nIdx) ?? Infinity)) {
        came.set(nIdx, current);
        gScore.set(nIdx, tentG);
        fScore.set(nIdx, tentG + heuristic(nx, ny));
        if (!open.includes(nIdx)) open.push(nIdx);
      }
    }
  }

  return []; // no path
}

// Simplify a path by removing collinear points for smoother movement.
export function simplifyPath(path: Path): Path {
  if (path.length <= 2) return path;
  const result: Path = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const [px, py] = path[i - 1];
    const [cx, cy] = path[i];
    const [nx, ny] = path[i + 1];
    const sameX = px === cx && cx === nx;
    const sameY = py === cy && cy === ny;
    if (!sameX && !sameY) result.push(path[i]);
  }
  result.push(path[path.length - 1]);
  return result;
}
