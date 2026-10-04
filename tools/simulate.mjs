// Runs the add-on script against a fake Minecraft API (tools/sim/mock.js):
// builds a maze, steps on a plate, triggers traps, reaches the exit, shuffles doors.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "tools", "sim", ".build");
mkdirSync(out, { recursive: true });
const main = readFileSync(join(root, "pack/scripts/main.js"), "utf8").replace('from "@minecraft/server"', 'from "./mock.js"');
writeFileSync(join(out, "main.js"), main);
copyFileSync(join(root, "pack/scripts/maze.js"), join(out, "maze.js"));
copyFileSync(join(root, "tools/sim/mock.js"), join(out, "mock.js"));
copyFileSync(join(root, "tools/sim/run.mjs"), join(out, "run.mjs"));
await import(pathToFileURL(join(out, "run.mjs")).href);
