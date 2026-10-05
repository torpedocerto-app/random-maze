import { world, system } from "@minecraft/server";
import { generateMaze } from "./maze.js";

/* ------------------------------------------------------------------ */
/* Random Maze — uses only STABLE APIs (no Beta APIs needed)          */
/*                                                                     */
/* /function maze             -> builds a NEW maze (41x41)            */
/* /scriptevent maze:new 31   -> custom size (15 to 61)               */
/* /scriptevent maze:test     -> checks that the script is running    */
/* ------------------------------------------------------------------ */

const DEFAULT_SIZE = 41;
const NUM_GATES = 16;
const TRAPS = [
  { type: "start", count: 2 }, // sends the player back to the entrance
  { type: "slow", count: 4 }, // strong slowness for 6s
  { type: "dark", count: 4 }, // blindness for 5s
];
const AUTO_CLOSE_TICKS = 8 * 20;
const SHUFFLE_INTERVAL_TICKS = 90 * 20; // every 90s, 2 doors change by themselves
const COMMANDS_PER_TICK = 40; // build in small batches so the game does not freeze
const GATE_BLOCK = "minecraft:mossy_cobblestone";
const WALL_BLOCK = "minecraft:cobblestone";
const STATE_KEY = "maze:state";
const TICKING_AREA = "random_maze_build";
const BUILD_TIMEOUT_TICKS = 30 * 20; // give up waiting for unloaded chunks after 30s

let state = loadState();
let building = false;
const closeTimers = new Map(); // "x|y|z" -> id
const trapCooldown = new Map(); // "playerId|x|z" -> tick when it can fire again
const startTick = new Map(); // playerId -> tick when they entered the maze
const exitCooldown = new Map(); // playerId -> tick

function loadState() {
  const raw = world.getDynamicProperty(STATE_KEY);
  if (typeof raw !== "string") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/* ------------------------------ building -------------------------- */

function buildMaze(player, size) {
  if (building) {
    player.sendMessage("§cA maze is already being built, please wait.");
    return;
  }
  building = true;

  const cells = Math.floor((size - 1) / 2);
  const maze = generateMaze(cells, NUM_GATES, TRAPS);
  const { W, H } = maze;

  // The maze is CENTERED on the player. The player STAYS in the middle while it
  // is built, so the whole area stays within the loaded distance.
  const loc = player.location;
  const ox = Math.floor(loc.x) - Math.floor(W / 2);
  const oy = Math.floor(loc.y);
  const oz = Math.floor(loc.z) - Math.floor(H / 2);
  const dim = player.dimension;

  // Each job has its own area, so we can check that its chunks are loaded first.
  const jobs = [];
  // phase 0 = floor + clearing, phase 1 = walls, doors, plates, markers.
  // Phase 1 only starts when phase 0 is completely done, otherwise a late
  // clearing band would erase walls that were already built.
  let phase = 0;
  const add = (cmd, x0, z0, x1, z1) => jobs.push({ cmd, x0, z0, x1, z1, phase });
  // Floor and clearing in bands of 8 rows: one giant /fill fails completely
  // if any corner of it is not loaded.
  for (let z = 0; z < H; z += 8) {
    const z1 = Math.min(z + 7, H - 1);
    add(`fill ${ox} ${oy - 1} ${oz + z} ${ox + W - 1} ${oy - 1} ${oz + z1} minecraft:stone`, ox, oz + z, ox + W - 1, oz + z1);
    add(`fill ${ox} ${oy} ${oz + z} ${ox + W - 1} ${oy + 3} ${oz + z1} minecraft:air`, ox, oz + z, ox + W - 1, oz + z1);
  }
  phase = 1;
  for (const r of maze.wallRuns) {
    add(`fill ${ox + r.x0} ${oy} ${oz + r.z} ${ox + r.x1} ${oy + 2} ${oz + r.z} ${WALL_BLOCK}`, ox + r.x0, oz + r.z, ox + r.x1, oz + r.z);
  }
  for (const g of maze.gates) {
    const gx = ox + g.gx, gz = oz + g.gz, px = ox + g.px, pz = oz + g.pz;
    add(`fill ${gx} ${oy} ${gz} ${gx} ${oy + 2} ${gz} ${GATE_BLOCK}`, gx, gz, gx, gz);
    add(`setblock ${px} ${oy} ${pz} minecraft:stone_pressure_plate`, px, pz, px, pz);
  }
  const ex = ox + maze.entrance.x, ez = oz + maze.entrance.z;
  const xx = ox + maze.exit.x, xz = oz + maze.exit.z;
  add(`setblock ${ex} ${oy - 1} ${ez} minecraft:emerald_block`, ex, ez, ex, ez);
  add(`setblock ${xx} ${oy - 1} ${xz} minecraft:redstone_block`, xx, xz, xx, xz);

  // Temporary ticking area: keeps the whole maze loaded while it is built.
  try { dim.runCommand(`tickingarea remove ${TICKING_AREA}`); } catch { /* none yet */ }
  try {
    dim.runCommand(`tickingarea add ${ox} ${oy - 1} ${oz} ${ox + W - 1} ${oy + 3} ${oz + H - 1} ${TICKING_AREA} true`);
  } catch {
    // ticking areas full or not allowed: staying in the middle still covers most sizes
  }

  player.sendMessage(`§e[Random Maze] Building a ${W}x${H} maze... stay still!`);

  // Cancel open doors from the previous maze
  closeTimers.forEach((id) => system.clearRun(id));
  closeTimers.clear();
  startTick.clear();

  const isLoaded = (x, z) => {
    try {
      return dim.getBlock({ x, y: oy, z }) !== undefined;
    } catch {
      return false; // LocationInUnloadedChunkError
    }
  };
  const areaLoaded = (j) => isLoaded(j.x0, j.z0) && isLoaded(j.x1, j.z1) && isLoaded(j.x0, j.z1) && isLoaded(j.x1, j.z0);

  let pending = jobs;
  const startedAt = system.currentTick;
  const job = system.runInterval(() => {
    const waiting = [];
    let done = 0;
    const currentPhase = Math.min(...pending.map((j) => j.phase));
    for (const j of pending) {
      if (j.phase !== currentPhase || done >= COMMANDS_PER_TICK || !areaLoaded(j)) {
        waiting.push(j);
        continue;
      }
      try {
        dim.runCommand(j.cmd);
      } catch {
        // e.g. "no blocks changed" — the area is loaded, so this is not a real failure
      }
      done++;
    }
    pending = waiting;

    const timedOut = system.currentTick - startedAt > BUILD_TIMEOUT_TICKS;
    if (pending.length > 0 && !timedOut) return;

    system.clearRun(job);
    try { dim.runCommand(`tickingarea remove ${TICKING_AREA}`); } catch { /* already gone */ }
    state = {
      dim: dim.id,
      ox,
      oy,
      oz,
      W,
      H,
      gates: maze.gates.map((g) => [ox + g.gx, oz + g.gz]),
      traps: maze.traps.map((t) => [ox + t.x, oz + t.z, t.type]),
      entrance: [ex, ez],
      exit: [xx, xz],
    };
    world.setDynamicProperty(STATE_KEY, JSON.stringify(state));
    building = false;
    player.teleport({ x: ex - 2 + 0.5, y: oy, z: ez + 0.5 }, { dimension: dim, rotation: { x: 0, y: -90 } });

    if (pending.length > 0) {
      world.sendMessage(
        `§c[Random Maze] ${pending.length} parts of the maze could not be built because that area was not loaded. ` +
          `Try a smaller maze (/scriptevent maze:new 41) or increase the simulation distance in the world settings.`
      );
    } else {
      world.sendMessage(
        `§a[Random Maze] Ready! ${maze.gates.length} secret doors and ${maze.traps.length} hidden traps. Good luck!`
      );
    }
  }, 1);
}

/* ------------------------------ doors ----------------------------- */

function setGate(dim, x, y, z, open) {
  dim.runCommand(`fill ${x} ${y} ${z} ${x} ${y + 2} ${z} ${open ? "minecraft:air" : GATE_BLOCK}`);
  dim.playSound(open ? "random.door_open" : "random.door_close", { x, y, z });
}

function openTemporarily(dim, x, y, z) {
  setGate(dim, x, y, z, true);
  const k = `${x}|${y}|${z}`;
  const existing = closeTimers.get(k);
  if (existing !== undefined) system.clearRun(existing);
  closeTimers.set(
    k,
    system.runTimeout(() => {
      closeTimers.delete(k);
      try {
        setGate(dim, x, y, z, false);
      } catch {
        // area unloaded
      }
    }, AUTO_CLOSE_TICKS)
  );
}

// Stepping on a plate opens the mossy cobblestone next to it
world.afterEvents.pressurePlatePush.subscribe((event) => {
  const plate = event.block;
  const dim = plate.dimension;
  const { x, y, z } = plate.location;
  for (const [nx, nz] of [[x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1]]) {
    try {
      const b = dim.getBlock({ x: nx, y, z: nz });
      if ((b && b.typeId === GATE_BLOCK) || closeTimers.has(`${nx}|${y}|${nz}`)) {
        openTemporarily(dim, nx, y, nz);
      }
    } catch {
      // ignora
    }
  }
});

// Automatic shuffle
system.runInterval(() => {
  if (!state || building) return;
  const dim = world.getDimension(state.dim);
  for (let n = 0; n < 2; n++) {
    const [x, z] = state.gates[Math.floor(Math.random() * state.gates.length)];
    const y = state.oy;
    try {
      const b = dim.getBlock({ x, y, z });
      if (!b) continue;
      const k = `${x}|${y}|${z}`;
      const existing = closeTimers.get(k);
      if (existing !== undefined) system.clearRun(existing);
      closeTimers.delete(k);
      setGate(dim, x, y, z, b.typeId !== "minecraft:air");
    } catch {
      // area not loaded
    }
  }
}, SHUFFLE_INTERVAL_TICKS);

/* --------------------- traps, entrance and exit ------------------- */

function trigger(player, type) {
  if (type === "start") {
    player.teleport(
      { x: state.entrance[0] + 1.5, y: state.oy, z: state.entrance[1] + 0.5 },
      { dimension: world.getDimension(state.dim), rotation: { x: 0, y: -90 } }
    );
    player.sendMessage("§c[Trap] A magic trapdoor sent you back to the start!");
    player.playSound("mob.endermen.portal");
  } else if (type === "slow") {
    player.addEffect("slowness", 6 * 20, { amplifier: 3, showParticles: true });
    player.sendMessage("§c[Trap] Your feet feel heavy...");
    player.playSound("mob.spider.say");
  } else if (type === "dark") {
    player.addEffect("blindness", 5 * 20, { amplifier: 0, showParticles: false });
    player.sendMessage("§c[Trap] Everything went dark!");
    player.playSound("mob.wither.ambient");
  }
}

system.runInterval(() => {
  if (!state || building) return;
  const now = system.currentTick;
  for (const player of world.getAllPlayers()) {
    if (player.dimension.id !== state.dim) continue;
    const loc = player.location;
    const x = Math.floor(loc.x);
    const y = Math.floor(loc.y);
    const z = Math.floor(loc.z);
    if (y !== state.oy) continue;

    // Walked in through the entrance -> start the timer
    if (x === state.entrance[0] && z === state.entrance[1]) {
      if (!startTick.has(player.id)) startTick.set(player.id, now);
      continue;
    }

    // Reached the exit
    if (x === state.exit[0] && z === state.exit[1]) {
      if ((exitCooldown.get(player.id) ?? 0) > now) continue;
      exitCooldown.set(player.id, now + 200);
      const start = startTick.get(player.id);
      startTick.delete(player.id);
      const time = start !== undefined ? ` in ${Math.round((now - start) / 20)} seconds` : "";
      world.sendMessage(`§6[Random Maze] ${player.name} escaped the maze${time}!`);
      player.playSound("random.levelup");
      continue;
    }

    // Traps
    for (const [tx, tz, type] of state.traps) {
      if (tx !== x || tz !== z) continue;
      const k = `${player.id}|${tx}|${tz}`;
      if ((trapCooldown.get(k) ?? 0) > now) break;
      trapCooldown.set(k, now + 100);
      try {
        trigger(player, type);
      } catch {
        // ignora
      }
      break;
    }
  }
}, 4);

/* ----------------------------- commands --------------------------- */

system.afterEvents.scriptEventReceive.subscribe((event) => {
  if (event.id === "maze:test") {
    world.sendMessage("§a[Random Maze] The script is working!");
    return;
  }
  if (event.id !== "maze:new") return;
  const player = event.sourceEntity;
  if (!player || player.typeId !== "minecraft:player") return;

  let size = parseInt(event.message, 10);
  if (isNaN(size)) size = DEFAULT_SIZE;
  size = Math.max(15, Math.min(61, size));
  if (size % 2 === 0) size += 1;
  buildMaze(player, size);
});

world.afterEvents.playerSpawn.subscribe((event) => {
  if (!event.initialSpawn) return;
  system.runTimeout(() => {
    event.player.sendMessage("§7[Random Maze] script loaded.");
  }, 60);
});
