import { spawn } from "node:child_process";

export function runGit(cwd: string, args: string[], input?: string, allowFailure = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["-c", "core.quotepath=false", "--literal-pathspecs", ...args], {
      cwd, windowsHide: true, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", GIT_PAGER: "cat" },
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let length = 0;
    let failure: Error | undefined;
    const timer = setTimeout(() => { failure = new Error("WB_GIT_TIMEOUT"); child.kill(); }, 30_000);
    child.stdout.on("data", (data: Buffer) => {
      length += data.length;
      if (length > 12_000_000) { failure = new Error("WB_DIFF_TOO_LARGE"); child.kill(); }
      else output.push(data);
    });
    child.stderr.on("data", (data: Buffer) => { if (errors.length < 100) errors.push(data); });
    child.once("error", (error: NodeJS.ErrnoException) => { clearTimeout(timer); reject(new Error(error.code === "ENOENT" ? "WB_GIT_MISSING" : error.message)); });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (failure) reject(failure);
      else if (code !== 0 && !allowFailure) reject(new Error(Buffer.concat(errors).toString("utf8").trim() || `Git exited with code ${code}.`));
      else resolve(code !== 0 ? "" : Buffer.concat(output).toString("utf8"));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

export async function repositoryRoot(cwd: string): Promise<string> {
  try { return (await runGit(cwd, ["rev-parse", "--show-toplevel"])).trim(); }
  catch (error) { if (String(error).includes("WB_GIT_MISSING")) throw error; throw new Error("WB_NOT_REPOSITORY"); }
}

export async function resolveCommit(root: string, ref: string): Promise<string> {
  if (!ref || ref.includes("\0")) throw new Error("WB_REVIEW_REF_REQUIRED");
  const commit = (await runGit(root, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], undefined, true)).trim();
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error(`WB_INVALID_REF: ${ref}`);
  return commit;
}
