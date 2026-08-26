import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptPath = fileURLToPath(import.meta.url);
const rootDir = resolve(dirname(scriptPath), "..");
const piDir = join(rootDir, "vendor", "pi");
const buildMarkerPath = join(rootDir, "node_modules", ".cache", "moros", "pi-source-build.json");
const buildRecipe = createHash("sha256").update(readFileSync(scriptPath)).digest("hex");
const copilotModelsPath = join(piDir, "packages", "ai", "dist", "providers", "github-copilot.models.js");
const copilotModelDataPath = join(piDir, "packages", "ai", "dist", "providers", "data", "github-copilot.json");
const requiredDistFiles = [
  copilotModelsPath,
  copilotModelDataPath,
  join(piDir, "packages", "ai", "dist", "types.d.ts"),
  join(piDir, "packages", "agent", "dist", "index.js"),
  join(piDir, "packages", "agent", "dist", "types.d.ts"),
  join(piDir, "packages", "protocol", "dist", "index.js"),
  join(piDir, "packages", "client", "dist", "index.js"),
  join(piDir, "packages", "telemetry", "dist", "index.js"),
  join(piDir, "packages", "telemetry", "dist", "index.d.ts"),
  join(piDir, "packages", "tui", "dist", "index.js"),
  join(piDir, "packages", "coding-agent", "dist", "index.js"),
  join(piDir, "packages", "coding-agent", "dist", "core", "agent-session.d.ts"),
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

function sourceRevision() {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: piDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error("Unable to resolve the Pi source revision.");
  }
  return result.stdout.trim();
}

function buildMarkerMatches(revision) {
  if (!existsSync(buildMarkerPath)) return false;
  try {
    const marker = JSON.parse(readFileSync(buildMarkerPath, "utf8"));
    return marker.sourceRevision === revision && marker.buildRecipe === buildRecipe;
  } catch {
    return false;
  }
}

function writeBuildMarker(revision) {
  mkdirSync(dirname(buildMarkerPath), { recursive: true });
  writeFileSync(
    buildMarkerPath,
    `${JSON.stringify({ sourceRevision: revision, buildRecipe, builtAt: new Date().toISOString() }, null, 2)}\n`,
    "utf8",
  );
}

function builtFromSourceHasRequiredModels() {
  if (!requiredDistFiles.every(existsSync)) return false;
  return [copilotModelsPath, copilotModelDataPath]
    .some((path) => readFileSync(path, "utf8").includes("claude-sonnet-5"));
}

if (process.env.MOROS_SKIP_PI_SOURCE_BUILD === "1") {
  process.exit(0);
}

if (!sourceCheckoutReady()) {
  throw new Error(
    `Pi source checkout is missing at ${piDir}. Run: git submodule update --init --recursive`,
  );
}

const revision = sourceRevision();

if (builtFromSourceHasRequiredModels() && buildMarkerMatches(revision)) {
  process.exit(0);
}

run("npm", ["ci", "--ignore-scripts"], piDir);

run("npm", ["run", "build", "--workspace", "@earendil-works/pi-tui"], piDir);
run("npm", ["run", "build", "--workspace", "@earendil-works/pi-telemetry"], piDir);

// Pi AI now keeps provider values in generated, ignored JSON files. Its package build
// creates those catalogs before compiling and copies them into dist. Restore the tracked
// generated TypeScript afterward so installing Moros never dirties the Pi checkout.
try {
  run("npm", ["run", "build", "--workspace", "@earendil-works/pi-ai"], piDir);
} finally {
  run("git", ["restore", "--", "packages/ai/src/providers", "packages/ai/src/models.generated.ts"], piDir);
}

run("npm", ["run", "build", "--workspace", "@earendil-works/pi-agent-core"], piDir);
run("npm", ["run", "build", "--workspace", "@earendil-works/pi-protocol"], piDir);
run("npm", ["run", "build", "--workspace", "@earendil-works/pi-client"], piDir);
run("npm", ["run", "build", "--workspace", "@earendil-works/pi-coding-agent"], piDir);

if (!builtFromSourceHasRequiredModels()) {
  throw new Error("Built Pi source does not contain claude-sonnet-5 in github-copilot models.");
}

writeBuildMarker(revision);
