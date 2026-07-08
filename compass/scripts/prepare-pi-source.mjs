import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const piDir = join(rootDir, "vendor", "pi");
const requiredDistFiles = [
  join(piDir, "packages", "ai", "dist", "providers", "github-copilot.models.js"),
  join(piDir, "packages", "agent", "dist", "index.js"),
  join(piDir, "packages", "tui", "dist", "index.js"),
  join(piDir, "packages", "coding-agent", "dist", "index.js"),
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, HUSKY: "0" },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`);
  }
}

function sourceCheckoutReady() {
  return existsSync(join(piDir, "package.json")) && existsSync(join(piDir, "packages", "ai", "package.json"));
}

function builtFromSourceHasRequiredModels() {
  if (!requiredDistFiles.every(existsSync)) return false;
  const copilotModels = readFileSync(requiredDistFiles[0], "utf8");
  return copilotModels.includes("claude-sonnet-5");
}

if (process.env.COMPASS_SKIP_PI_SOURCE_BUILD === "1") {
  process.exit(0);
}

if (!sourceCheckoutReady()) {
  throw new Error(
    `Pi source checkout is missing at ${piDir}. Run: git submodule update --init --recursive`,
  );
}

if (builtFromSourceHasRequiredModels()) {
  process.exit(0);
}

if (!existsSync(join(piDir, "node_modules"))) {
  run("npm", ["ci", "--ignore-scripts"], piDir);
}

const buildSteps = [
  ["run", "build", "--workspace", "@earendil-works/pi-tui"],
  // Pi AI's default build regenerates model source files from upstream catalogs.
  // Compass needs the checked-in upstream source exactly, then a local dist compile.
  ["exec", "--workspace", "@earendil-works/pi-ai", "--", "tsgo", "-p", "tsconfig.build.json"],
  ["run", "build", "--workspace", "@earendil-works/pi-agent-core"],
  ["run", "build", "--workspace", "@earendil-works/pi-coding-agent"],
];

for (const args of buildSteps) {
  run("npm", args, piDir);
}

if (!builtFromSourceHasRequiredModels()) {
  throw new Error("Built Pi source does not contain claude-sonnet-5 in github-copilot models.");
}
