import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { ApprovalController } from "../src/main/agent/approval-controller.ts";
import { LifecycleCoordinator } from "../src/main/agent/lifecycle-coordinator.ts";
import type { AgentUiEvent, PermissionMode } from "../src/shared/types.ts";

interface Deferred {
  promise: Promise<void>;
  resolve(): void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((resolvePromise) => {
      resolve = resolvePromise;
    }),
    resolve: () => resolve(),
  };
}

interface RuntimeConfig {
  permissionMode: PermissionMode;
  workspaceDir: string;
}

interface RuntimeOwner {
  config: RuntimeConfig;
  prompt(): string;
  toolCall(event: {
    toolName: string;
    input: Record<string, unknown>;
  }): Promise<unknown>;
}

function runtimeOwner(
  controller: ApprovalController,
  config: RuntimeConfig,
): RuntimeOwner {
  let toolCall: RuntimeOwner["toolCall"] | undefined;
  const extension = controller.extension(() => ({
    mode: config.permissionMode,
    workspaceDir: config.workspaceDir,
  }));
  void extension({
    on(event: string, handler: RuntimeOwner["toolCall"]) {
      if (event === "tool_call") toolCall = handler;
    },
  } as never);
  assert.ok(toolCall);
  return {
    config,
    prompt: () => config.workspaceDir,
    toolCall,
  };
}

test("a deferred candidate cannot expose staged workspace to old prompts or approvals", async () => {
  const events: AgentUiEvent[] = [];
  const controller = new ApprovalController({
    emit: (event) => events.push(event),
    nextId: () => "approval-old-owner",
    policy: () => ({ mode: "full", workspaceDir: resolve("fallback") }),
    explain: async () => undefined,
  });
  const lifecycle = new LifecycleCoordinator<RuntimeOwner>(() => {});
  const oldConfig: RuntimeConfig = {
    permissionMode: "approve",
    workspaceDir: resolve("old-workspace"),
  };
  const stagedConfig: RuntimeConfig = {
    permissionMode: "approve",
    workspaceDir: resolve("new-workspace"),
  };
  let publishedConfig = oldConfig;
  let persistedConfig = oldConfig;
  await lifecycle.replace(async () => runtimeOwner(controller, oldConfig));

  const candidateStarted = deferred();
  const releaseCandidate = deferred();
  const replacement = lifecycle.replace(
    async () => {
      candidateStarted.resolve();
      await releaseCandidate.promise;
      return runtimeOwner(controller, stagedConfig);
    },
    () => {
      persistedConfig = stagedConfig;
      publishedConfig = stagedConfig;
    },
  );
  await candidateStarted.promise;

  assert.equal(lifecycle.current?.prompt(), oldConfig.workspaceDir);
  assert.equal(publishedConfig, oldConfig);
  assert.equal(persistedConfig, oldConfig);
  const oldDecision = lifecycle.current?.toolCall({
    toolName: "write",
    input: { path: resolve(stagedConfig.workspaceDir, "patient.txt") },
  });
  assert.equal(controller.snapshot().length, 1);
  controller.resolve("approval-old-owner", false);
  await oldDecision;

  releaseCandidate.resolve();
  await replacement;
  assert.equal(lifecycle.current?.prompt(), stagedConfig.workspaceDir);
  assert.equal(publishedConfig, stagedConfig);
  assert.equal(persistedConfig, stagedConfig);
  assert.equal(await lifecycle.current?.toolCall({
    toolName: "write",
    input: { path: resolve(stagedConfig.workspaceDir, "patient.txt") },
  }), undefined);
  assert.deepEqual(controller.snapshot(), []);
  assert.ok(events.some((event) => event.kind === "approval-request"));
});

test("a synchronous publication failure discards only the candidate and keeps the old owner", async () => {
  const ownerDisposals: string[] = [];
  const candidateDisposals: string[] = [];
  const lifecycle = new LifecycleCoordinator<{ id: string }>(
    (owner) => ownerDisposals.push(owner.id),
    () => {},
    (candidate) => candidateDisposals.push(candidate.id),
  );
  const oldOwner = await lifecycle.replace(async () => ({ id: "old" }));

  await assert.rejects(
    lifecycle.replace(
      async () => ({ id: "candidate" }),
      () => {
        throw new Error("persist staged settings failed");
      },
    ),
    /persist staged settings failed/,
  );

  assert.equal(lifecycle.current, oldOwner);
  assert.deepEqual(ownerDisposals, []);
  assert.deepEqual(candidateDisposals, ["candidate"]);
});
