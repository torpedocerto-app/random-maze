/* ------------------------------------------------------------------ */
/* Maze generator (pure JS, no Minecraft APIs, testable outside the   */
/* game). All coordinates are RELATIVE to the maze corner:             */
/* x/z = grid position; walkable cells are at (odd, odd).              */
/* ------------------------------------------------------------------ */

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * @param {number} cells   cells per side (e.g. 20 -> 41x41 grid)
 * @param {number} numGates number of secret doors
 * @param {{type: string, count: number}[]} trapSpec trap types and how many of each
 */
export function generateMaze(cells, numGates, trapSpec) {
  const W = 2 * cells + 1;
  const H = W;
  const grid = [];
  for (let z = 0; z < H; z++) grid.push(new Array(W).fill(true));

  // Iterative backtracking (no recursion, so the stack never overflows)
  const visited = [];
  for (let z = 0; z < cells; z++) visited.push(new Array(cells).fill(false));
  const stack = [[0, 0]];
  visited[0][0] = true;
  grid[1][1] = false;
  while (stack.length > 0) {
    const [cx, cz] = stack[stack.length - 1];
    const options = [];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx >= 0 && nx < cells && nz >= 0 && nz < cells && !visited[nz][nx]) {
        options.push([nx, nz, dx, dz]);
      }
    }
    if (options.length === 0) {
      stack.pop();
      continue;
    }
    const [nx, nz, dx, dz] = options[Math.floor(Math.random() * options.length)];
    visited[nz][nx] = true;
    grid[2 * cz + 1 + dz][2 * cx + 1 + dx] = false; // knock down the wall between the cells
    grid[2 * nz + 1][2 * nx + 1] = false;
    stack.push([nx, nz]);
  }

  const entrance = { x: 0, z: 1 };
  const exit = { x: W - 1, z: H - 2 };
  grid[entrance.z][entrance.x] = false;
  grid[exit.z][exit.x] = false;

  // Secret doors: inner walls between two cells that are still standing.
  // Opening one creates a shortcut; when closed, the maze is still solvable.
  const candidates = [];
  for (let z = 1; z < H - 1; z++) {
    for (let x = 1; x < W - 1; x++) {
      const xEven = x % 2 === 0;
      const zEven = z % 2 === 0;
      if (xEven !== zEven && grid[z][x]) candidates.push({ x, z, xEven });
    }
  }
  shuffle(candidates);

  const reserved = new Set([`1,1`, `${W - 2},${H - 2}`]); // entrance and exit cells
  const gates = [];
  for (const c of candidates) {
    if (gates.length >= numGates) break;
    const sides = c.xEven
      ? [[c.x - 1, c.z], [c.x + 1, c.z]]
      : [[c.x, c.z - 1], [c.x, c.z + 1]];
    shuffle(sides);
    const free = sides.find(([px, pz]) => !reserved.has(`${px},${pz}`));
    if (!free) continue;
    reserved.add(`${free[0]},${free[1]}`);
    gates.push({ gx: c.x, gz: c.z, px: free[0], pz: free[1] });
  }

  // Hidden traps: in free cells (no plate, away from the entrance)
  const freeCells = [];
  for (let z = 1; z < H - 1; z += 2) {
    for (let x = 1; x < W - 1; x += 2) {
      if (reserved.has(`${x},${z}`)) continue;
      if (x + z < 8) continue; // no traps right at the entrance
      freeCells.push([x, z]);
    }
  }
  shuffle(freeCells);
  const traps = [];
  for (const { type, count } of trapSpec) {
    for (let i = 0; i < count && freeCells.length > 0; i++) {
      const [x, z] = freeCells.pop();
      traps.push({ x, z, type });
    }
  }

  // Normal walls grouped into horizontal runs (fewer /fill commands)
  const gateSet = new Set(gates.map((g) => `${g.gx},${g.gz}`));
  const wallRuns = [];
  for (let z = 0; z < H; z++) {
    let x = 0;
    while (x < W) {
      if (grid[z][x] && !gateSet.has(`${x},${z}`)) {
        const x0 = x;
        while (x < W && grid[z][x] && !gateSet.has(`${x},${z}`)) x++;
        wallRuns.push({ x0, x1: x - 1, z });
      } else {
        x++;
      }
    }
  }

  return { W, H, grid, entrance, exit, gates, traps, wallRuns };
}
