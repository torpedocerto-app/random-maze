const subs = {}; const sub = (n) => ({ subscribe: (f) => { subs[n] = f; return f; } });
const props = {}; let tick = 0; const jobs = new Map(); let nid = 1;
export const blocks = new Map(); export const log = [];
function applyFill(cmd) {
  const p = cmd.split(" "); const n = p.slice(1, 7).map(Number); const b = p[7];
  for (let x = n[0]; x <= n[3]; x++) for (let y = n[1]; y <= n[4]; y++) for (let z = n[2]; z <= n[5]; z++) blocks.set(`${x},${y},${z}`, b);
}
export const dim = { id: "minecraft:overworld",
  runCommand(c) { log.push(c); if (c.startsWith("fill")) applyFill(c);
    else if (c.startsWith("setblock")) { const p = c.split(" "); blocks.set(`${p[1]},${p[2]},${p[3]}`, p[4]); } },
  getBlock({ x, y, z }) { return { typeId: blocks.get(`${x},${y},${z}`) ?? "minecraft:air", location: { x, y, z }, dimension: dim }; },
  playSound() {} };
export const player = { id: "p1", name: "Rogerio", typeId: "minecraft:player", dimension: dim, location: { x: 100.5, y: 64, z: 200.5 },
  msgs: [], effects: [], sendMessage(m) { this.msgs.push(m); }, teleport(l) { this.location = { ...l }; },
  addEffect(e) { this.effects.push(e); }, playSound() {} };
export const world = { beforeEvents: {}, afterEvents: { pressurePlatePush: sub("plate"), playerSpawn: sub("spawn") },
  getDynamicProperty: (k) => props[k], setDynamicProperty: (k, v) => { props[k] = v; },
  getDimension: () => dim, getAllPlayers: () => [player], sendMessage: (m) => player.msgs.push(m) };
export const system = { afterEvents: { scriptEventReceive: sub("script") }, get currentTick() { return tick; },
  runInterval(f, t) { const id = nid++; jobs.set(id, { f, t, next: tick + t, rep: true }); return id; },
  runTimeout(f, t) { const id = nid++; jobs.set(id, { f, t, next: tick + t, rep: false }); return id; },
  clearRun(id) { jobs.delete(id); } };
export function advance(n) { for (let i = 0; i < n; i++) { tick++;
  for (const [id, j] of [...jobs]) if (jobs.has(id) && j.next <= tick) { j.f(); if (j.rep && jobs.has(id)) j.next = tick + j.t; else if (!j.rep) jobs.delete(id); } } }
export { subs, props };
