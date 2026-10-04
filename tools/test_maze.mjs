import { generateMaze } from "../pack/scripts/maze.js";
const spec = [{ type: "start", count: 2 }, { type: "slow", count: 4 }, { type: "dark", count: 4 }];
for (let run = 0; run < 200; run++) {
  const m = generateMaze(20, 16, spec);
  const { W, H, grid, gates, traps, entrance, exit } = m;
  // solvable with every door closed (the grid already counts doors as walls)
  const seen = new Set([`${entrance.x},${entrance.z}`]); const q = [[entrance.x, entrance.z]];
  while (q.length) { const [x, z] = q.shift();
    for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) { const nx=x+dx, nz=z+dz;
      if (nx<0||nz<0||nx>=W||nz>=H||grid[nz][nx]||seen.has(`${nx},${nz}`)) continue;
      seen.add(`${nx},${nz}`); q.push([nx,nz]); } }
  if (!seen.has(`${exit.x},${exit.z}`)) throw new Error("no solution");
  if (gates.length !== 16) throw new Error("doors: " + gates.length);
  for (const g of gates) {
    if (!grid[g.gz][g.gx]) throw new Error("door is not a wall");
    if (grid[g.pz][g.px]) throw new Error("plate inside a wall");
    if (Math.abs(g.gx-g.px)+Math.abs(g.gz-g.pz) !== 1) throw new Error("plate not next to its door");
  }
  const plates = new Set(gates.map(g=>`${g.px},${g.pz}`));
  if (plates.size !== gates.length) throw new Error("duplicate plate");
  for (const t of traps) { if (plates.has(`${t.x},${t.z}`) || grid[t.z][t.x]) throw new Error("bad trap"); }
  if (traps.length !== 10) throw new Error("traps: " + traps.length);
  if (run === 0) {
    console.log(`grid ${W}x${H}, wall runs: ${m.wallRuns.length}, doors: ${gates.length}, traps: ${traps.length}`);
    const pm = new Map(gates.map(g=>[`${g.px},${g.pz}`,"o"])); gates.forEach(g=>pm.set(`${g.gx},${g.gz}`,"▒"));
    traps.forEach(t=>pm.set(`${t.x},${t.z}`, t.type[0].toUpperCase()));
    for (let z=0; z<H; z++) console.log(grid[z].map((w,x)=>pm.get(`${x},${z}`) ?? (w?"█":" ")).join(""));
  }
}
// two mazes in a row must be different
const a = JSON.stringify(generateMaze(20,16,spec).grid), b = JSON.stringify(generateMaze(20,16,spec).grid);
console.log("200 valid mazes; two in a row differ:", a !== b);
