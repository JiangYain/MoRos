import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolApproval } from "../src/main/permission-policy.ts";

const workspace = "C:\\workspace";

test("full access never requests approval", () => {
  assert.equal(
    evaluateToolApproval("full", workspace, "shell_command", { command: "Remove-Item file.txt" }),
    undefined,
  );
});

test("ask mode permits core reads and in-workspace edits", () => {
  assert.equal(evaluateToolApproval("ask", workspace, "read", { path: "notes.md" }), undefined);
  assert.equal(evaluateToolApproval("ask", workspace, "edit", { path: "notes.md" }), undefined);
});

test("ask mode protects external edits across common path fields", () => {
  assert.ok(evaluateToolApproval("ask", workspace, "write", { file_path: "D:\\outside.txt" }));
});

test("path containment is independent of the host operating system", () => {
  assert.equal(
    evaluateToolApproval("ask", "C:\\workspace", "write", {
      file_path: "C:\\workspace\\notes\\inside.txt",
    }),
    undefined,
  );
  assert.ok(
    evaluateToolApproval("ask", "C:\\workspace", "write", {
      file_path: "C:\\workspace-sibling\\outside.txt",
    }),
  );

  assert.equal(
    evaluateToolApproval("ask", "/workspace", "write", {
      file_path: "/workspace/notes/inside.txt",
    }),
    undefined,
  );
  assert.ok(
    evaluateToolApproval("ask", "/workspace", "write", {
      file_path: "/workspace-sibling/outside.txt",
    }),
  );

  assert.ok(
    evaluateToolApproval("ask", "C:\\workspace", "write", {
      file_path: "/workspace/foreign-posix-path.txt",
    }),
  );
  assert.ok(
    evaluateToolApproval("ask", "/workspace", "write", {
      file_path: "C:\\workspace\\foreign-windows-path.txt",
    }),
  );
});

test("ask mode requests approval for every shell command", () => {
  assert.ok(evaluateToolApproval("ask", workspace, "bash", { command: "git status" }));
  assert.ok(
    evaluateToolApproval("ask", workspace, "shell_command", {
      command: "python -c \"open('outside.txt','w').write('x')\"",
    }),
  );
});

test("approve mode only permits explicitly read-only shell commands", () => {
  assert.equal(
    evaluateToolApproval("approve", workspace, "shell_command", { command: "git status --short" }),
    undefined,
  );
  assert.ok(
    evaluateToolApproval("approve", workspace, "shell_command", {
      command: "git status > status.txt",
    }),
  );
  assert.ok(
    evaluateToolApproval("approve", workspace, "shell_command", {
      command: "[IO.File]::WriteAllText('outside.txt', 'x')",
    }),
  );
});

test("unknown dynamic tools require approval outside full mode", () => {
  assert.ok(evaluateToolApproval("ask", workspace, "deploy_site", {}));
  assert.ok(evaluateToolApproval("approve", workspace, "deploy_site", {}));
});
