import { posix, win32 } from "node:path";
import type { PermissionMode } from "@shared/types";

export interface ToolApprovalRequest {
  message: string;
  detail: string;
}

const CORE_READ_TOOLS = new Set(["read", "grep", "find", "ls", "workbench_terminal_read", "workbench_browser_inspect", "workbench_review_read"]);
const FILE_WRITE_TOOLS = new Set(["edit", "write"]);
const SHELL_TOOLS = new Set(["bash", "shell", "shell_command", "workbench_terminal_command"]);

const READ_ONLY_COMMANDS = [
  /^(?:pwd|whoami|hostname|date|time)(?:\s+.*)?$/i,
  /^(?:ls|dir|tree)(?:\s+.*)?$/i,
  /^(?:rg|grep|find|where|where\.exe)(?:\s+.*)?$/i,
  /^(?:cat|type|get-content|select-string)(?:\s+.*)?$/i,
  /^git\s+(?:status|diff|log|show|branch|remote|rev-parse|ls-files|ls-tree)(?:\s+.*)?$/i,
  /^npm\s+(?:ls|list|view|explain)(?:\s+.*)?$/i,
];

function commandPreview(command: string): string {
  const singleLine = command.replace(/\s+/g, " ").trim();
  return singleLine.length > 240 ? `${singleLine.slice(0, 237)}…` : singleLine;
}

type PathFlavor = "posix" | "win32";

const nativePathFlavor: PathFlavor = process.platform === "win32" ? "win32" : "posix";

function explicitPathFlavor(value: string): PathFlavor | undefined {
  if (/^[A-Za-z]:/.test(value) || value.startsWith("\\")) return "win32";
  if (value.startsWith("/")) return "posix";
  return undefined;
}

function workspacePathFlavor(workspaceDir: string): PathFlavor {
  return explicitPathFlavor(workspaceDir) ?? nativePathFlavor;
}

function resolveWorkspacePath(path: string, workspaceDir: string): string {
  const workspaceFlavor = workspacePathFlavor(workspaceDir);
  const pathFlavor = explicitPathFlavor(path);
  if (pathFlavor && pathFlavor !== workspaceFlavor) return path;

  const pathApi = workspaceFlavor === "win32" ? win32 : posix;
  return pathApi.resolve(workspaceDir, path);
}

function pathIsInsideWorkspace(path: string, workspaceDir: string): boolean {
  const workspaceFlavor = workspacePathFlavor(workspaceDir);
  const pathFlavor = explicitPathFlavor(path);
  if (pathFlavor && pathFlavor !== workspaceFlavor) return false;

  const pathApi = workspaceFlavor === "win32" ? win32 : posix;
  const workspace = pathApi.resolve(workspaceDir);
  const target = pathApi.resolve(workspace, path);
  const offset = pathApi.relative(workspace, target);
  return (
    offset === "" ||
    (!offset.startsWith(`..${pathApi.sep}`) && offset !== ".." && !pathApi.isAbsolute(offset))
  );
}

function inputPaths(input: Record<string, unknown>): string[] {
  const candidates = [input.path, input.filePath, input.file_path, input.target, input.destination];
  return candidates.filter((value): value is string => typeof value === "string" && value.length > 0);
}

function commandIsExplicitlyReadOnly(command: string): boolean {
  const normalized = command.trim();
  if (!normalized) return false;
  if (/[>|;&`]|\$\(|\r|\n/.test(normalized)) return false;
  return READ_ONLY_COMMANDS.some((pattern) => pattern.test(normalized));
}

function approval(reason: string, toolName: string, detail: string): ToolApprovalRequest {
  return {
    message: `Allow Moros to ${reason}?`,
    detail: `${toolName}\n${detail}`,
  };
}

export function evaluateToolApproval(
  mode: PermissionMode,
  workspaceDir: string,
  toolName: string,
  input: Record<string, unknown>,
): ToolApprovalRequest | undefined {
  if (mode === "full" || CORE_READ_TOOLS.has(toolName)) return undefined;

  const paths = inputPaths(input);
  const externalPaths = paths.filter((path) => !pathIsInsideWorkspace(path, workspaceDir));
  const command = typeof input.command === "string" ? input.command : "";
  const detail = command
    ? commandPreview(command)
    : paths.length > 0
      ? paths.map((path) => resolveWorkspacePath(path, workspaceDir)).join("\n")
      : commandPreview(JSON.stringify(input));

  if (FILE_WRITE_TOOLS.has(toolName)) {
    if (externalPaths.length === 0) return undefined;
    return approval("edit files outside the current workspace", toolName, detail);
  }

  if (SHELL_TOOLS.has(toolName)) {
    if (toolName === "workbench_terminal_command") return approval("send input to a live terminal", toolName, detail);
    if (mode === "approve" && commandIsExplicitlyReadOnly(command)) return undefined;
    return approval(
      mode === "ask" ? "run a shell command" : "run a command that is not provably read-only",
      toolName,
      detail,
    );
  }

  return approval(
    mode === "ask" ? "run an external or dynamic tool" : "run a tool that is not provably read-only",
    toolName,
    detail,
  );
}
