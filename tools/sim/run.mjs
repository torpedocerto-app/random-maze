import { subs, props, advance, player, dim, blocks, log } from "./mock.js";
await import("./main.js");
subs.script({ id: "maze:new", message: "41", sourceEntity: player });
advance(30);
const st = JSON.parse(props["maze:state"]);
console.log("commands run:", log.length, "| messages:", player.msgs);
// step on a plate and check the door opens and closes
const [gx, gz] = st.gates[0];
const plate = [[1,0],[-1,0],[0,1],[0,-1]].map(([dx,dz])=>[gx+dx,gz+dz]).find(([x,z])=>blocks.get(`${x},${st.oy},${z}`)==="minecraft:stone_pressure_plate");
subs.plate({ block: dim.getBlock({ x: plate[0], y: st.oy, z: plate[1] }) });
console.log("door after stepping:", blocks.get(`${gx},${st.oy},${gz}`));
advance(165);
console.log("door 8s later:", blocks.get(`${gx},${st.oy},${gz}`));
// traps
for (const [tx, tz, type] of st.traps.slice(0, 3)) { player.location = { x: tx + 0.5, y: st.oy, z: tz + 0.5 }; advance(5); }
console.log("effects:", player.effects, "| last messages:", player.msgs.slice(-3));
// entrance -> exit with timer
player.location = { x: st.entrance[0] + 0.5, y: st.oy, z: st.entrance[1] + 0.5 }; advance(5);
advance(400);
player.location = { x: st.exit[0] + 0.5, y: st.oy, z: st.exit[1] + 0.5 }; advance(5);
console.log("exit:", player.msgs.at(-1));
// shuffle runs without errors
advance(1900); console.log("shuffle ok; total commands:", log.length);
// building again gives a different maze
const before = props["maze:state"];
subs.script({ id: "maze:new", message: "", sourceEntity: player }); advance(30);
console.log("second maze is different:", before !== props["maze:state"]);
