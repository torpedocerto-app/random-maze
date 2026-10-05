// Regression test for "the end of the maze is not built": chunks far from the
// player are unloaded, exactly like the game on a phone.
import { subs, props, advance, player, blocks, cfg, reset } from "./mock.js";

function checkComplete(label) {
  const st = JSON.parse(props["maze:state"]);
  let missingFloor = 0, missingWall = 0;
  for (let x = st.ox; x < st.ox + st.W; x++)
    for (let z = st.oz; z < st.oz + st.H; z++) {
      if (!blocks.get(`${x},${st.oy - 1},${z}`)) missingFloor++;
      const outer = x === st.ox || z === st.oz || x === st.ox + st.W - 1 || z === st.oz + st.H - 1;
      const opening = (x === st.entrance[0] && z === st.entrance[1]) || (x === st.exit[0] && z === st.exit[1]);
      if (outer && !opening && blocks.get(`${x},${st.oy},${z}`) !== "minecraft:cobblestone") missingWall++;
    }
  const last = player.msgs.at(-1);
  console.log(`${label}: ${st.W}x${st.H}, missing floor ${missingFloor}, missing outer wall ${missingWall} | ${last.slice(0, 60)}`);
  return { missingFloor, missingWall, last };
}

function build(size) {
  reset();
  player.location = { x: 1000.5, y: 64, z: 2000.5 };
  subs.script({ id: "maze:new", message: String(size), sourceEntity: player });
  advance(700);
}

const fails = [];
// 1) the bug scenario: phone-like load radius, 61x61, ticking area works
cfg.loadRadius = 40; cfg.tickingAllowed = true; cfg.tickingDelay = 20;
for (const size of [41, 61]) {
  const r = checkComplete((build(size), `radius 40 + ticking area, size ${size}`));
  if (r.missingFloor || r.missingWall || !r.last.includes("Ready")) fails.push(`size ${size} incomplete`);
}
// 2) ticking area not allowed, but the player stays in the middle: 41 must still complete
cfg.tickingAllowed = false; cfg.loadRadius = 40;
{
  const r = checkComplete((build(41), "radius 40, no ticking area, size 41"));
  if (r.missingFloor || r.missingWall) fails.push("41 without ticking area incomplete");
}
// 3) impossible case: tiny radius, no ticking area -> must WARN instead of silently failing
cfg.loadRadius = 15; cfg.tickingAllowed = false;
{
  const r = checkComplete((build(61), "radius 15, no ticking area, size 61"));
  if (!r.last.includes("could not be built")) fails.push("no warning when incomplete");
}
cfg.loadRadius = Infinity; cfg.tickingAllowed = true;
if (fails.length) { console.error("FAILED:", fails); process.exit(1); }
console.log("chunk-loading tests passed");
