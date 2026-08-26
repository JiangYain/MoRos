import type { RuntimePrerequisites } from "../../shared/types.ts";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface RuntimeCommandInventory {
  git: { version?: string; path?: string };
  bash: { version?: string; path?: string };
}

export function dependencyAbortError(): Error {
  const error = new Error("Installation cancelled.");
  error.name = "AbortError";
  return error;
}

export function encodePowerShellCommand(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

export async function runProcess(
  command: string,
  args: string[],
  options: { signal?: AbortSignal; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw dependencyAbortError();
  return new Promise((resolveProcess, rejectProcess) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const finish = (result: ProcessResult): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener("abort", onAbort);
      resolveProcess(result);
    };
    const onAbort = (): void => {
      child.kill();
      if (!settled) {
        settled = true;
        if (timeout) clearTimeout(timeout);
        rejectProcess(dependencyAbortError());
      }
    };
    const timeout = options.timeoutMs
      ? setTimeout(() => {
          child.kill();
          finish({ code: -1, stdout, stderr: `${stderr}\nProcess timed out.`.trim() });
        }, options.timeoutMs)
      : undefined;
    timeout?.unref();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.once("error", (error) => finish({ code: -1, stdout, stderr: error.message }));
    child.once("close", (code) => finish({ code: code ?? -1, stdout, stderr }));
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingPath(candidates: Array<string | undefined>): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (candidate && await fileExists(candidate)) return candidate;
  }
  return undefined;
}

async function commandPath(command: string): Promise<string | undefined> {
  const result = await runProcess(process.platform === "win32" ? "where.exe" : "which", [command], {
    timeoutMs: 5_000,
  });
  return result.code === 0 ? result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean) : undefined;
}

async function detectGit(): Promise<{ version?: string; path?: string }> {
  const path = await firstExistingPath([
    await commandPath(process.platform === "win32" ? "git.exe" : "git"),
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "cmd", "git.exe") : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Git", "cmd", "git.exe") : undefined,
  ]);
  if (!path) return {};
  const result = await runProcess(path, ["--version"], { timeoutMs: 5_000 });
  const version = result.code === 0
    ? result.stdout.match(/git version\s+([^\s]+)/i)?.[1]
    : undefined;
  return { path, version };
}

async function detectBash(
  prerequisites: RuntimePrerequisites,
): Promise<{ version?: string; path?: string }> {
  const path = await firstExistingPath([
    prerequisites.shell.ok ? prerequisites.shell.shellPath : undefined,
    await commandPath(process.platform === "win32" ? "bash.exe" : "bash"),
    process.env.ProgramFiles ? join(process.env.ProgramFiles, "Git", "bin", "bash.exe") : undefined,
    process.env["ProgramFiles(x86)"]
      ? join(process.env["ProgramFiles(x86)"], "Git", "bin", "bash.exe")
      : undefined,
    process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "Git", "bin", "bash.exe") : undefined,
  ]);
  if (!path) return {};
  const result = await runProcess(path, ["--version"], { timeoutMs: 5_000 });
  const version = result.code === 0
    ? result.stdout.match(/version\s+([\d.]+)/i)?.[1]
    : undefined;
  return { path, version };
}

export async function inspectRuntimeCommands(
  prerequisites: RuntimePrerequisites,
): Promise<RuntimeCommandInventory> {
  const [git, bash] = await Promise.all([detectGit(), detectBash(prerequisites)]);
  return { git, bash };
}
