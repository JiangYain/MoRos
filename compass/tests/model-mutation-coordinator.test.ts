import assert from "node:assert/strict";
import test from "node:test";
import type { InitPayload } from "../src/shared/types.ts";
import { ModelMutationCoordinator } from "../src/main/model-mutation-coordinator.ts";

function payload(model: string): InitPayload {
  return {
    settings: {
      profileName: "",
      profileHandle: "",
      language: "en",
      commandExplanationLanguage: "auto",
      workspaceDir: "C:\\workspace",
      skillDirs: [],
      disabledSkills: [],
      permissionMode: "full",
      enabledModels: [model],
      summaryModel: { provider: "provider", id: model },
    },
    prerequisites: { platform: "win32", arch: "x64", nodeVersion: "22" },
    skills: [],
    models: [],
    providers: [],
    sessions: [],
    stats: {
      sessionId: "session",
      isStreaming: false,
      model: { provider: "provider", id: model, name: model },
      thinkingLevel: "off",
      permissionMode: "full",
      contextTokens: null,
      contextWindow: 1,
      contextPercent: null,
    },
    thread: [],
    approvals: [],
    clientRegistry: { clients: [], profiles: {}, assignments: {} },
    version: "test",
  };
}

test("model mutations stay ordered through publication and RPC completion", async () => {
  let currentModel = "model-a";
  let releaseFirstPublish!: () => void;
  const firstPublishCanFinish = new Promise<void>((resolve) => {
    releaseFirstPublish = resolve;
  });
  const order: string[] = [];
  const published: string[] = [];
  let publishCount = 0;
  const coordinator = new ModelMutationCoordinator({
    setModel: async (_provider, id) => {
      order.push(`select:${id}`);
      currentModel = id;
      return { ok: true };
    },
    setModelEnabled: async () => {
      order.push("disable:model-a");
      currentModel = "model-b";
      const snapshot = payload(currentModel);
      return { settings: snapshot.settings, stats: snapshot.stats };
    },
    publish: async () => {
      publishCount += 1;
      const snapshotModel = currentModel;
      order.push(`publish:${snapshotModel}:start`);
      if (publishCount === 1) await firstPublishCanFinish;
      published.push(snapshotModel);
      order.push(`publish:${snapshotModel}:end`);
      return payload(snapshotModel);
    },
  });

  const disable = coordinator.setModelEnabled("provider", "model-a", false);
  const select = coordinator.setModel("provider", "model-c");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["disable:model-a", "publish:model-b:start"]);
  releaseFirstPublish();
  const [disableUpdate, selectResult] = await Promise.all([disable, select]);

  assert.equal(disableUpdate.stats.model?.id, "model-b");
  assert.deepEqual(selectResult, { ok: true });
  assert.deepEqual(published, ["model-b", "model-c"]);
  assert.deepEqual(order, [
    "disable:model-a",
    "publish:model-b:start",
    "publish:model-b:end",
    "select:model-c",
    "publish:model-c:start",
    "publish:model-c:end",
  ]);
});

test("credential mutations share the model publication queue", async () => {
  let currentModel = "model-a";
  let releaseCredential!: () => void;
  const credentialCanFinish = new Promise<void>((resolve) => {
    releaseCredential = resolve;
  });
  const order: string[] = [];
  const coordinator = new ModelMutationCoordinator({
    setModel: async (_provider, id) => {
      order.push(`select:${id}`);
      currentModel = id;
      return { ok: true };
    },
    setModelEnabled: async () => {
      throw new Error("not used");
    },
    publish: async () => {
      order.push(`publish:${currentModel}`);
      return payload(currentModel);
    },
  });

  const credential = coordinator.mutateAndPublish(async () => {
    order.push("credential:start");
    await credentialCanFinish;
    order.push("credential:end");
  });
  const selection = coordinator.setModel("provider", "model-b");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["credential:start"]);

  releaseCredential();
  await Promise.all([credential, selection]);
  assert.deepEqual(order, [
    "credential:start",
    "credential:end",
    "publish:model-a",
    "select:model-b",
    "publish:model-b",
  ]);
});
