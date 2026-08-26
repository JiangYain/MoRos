import assert from "node:assert/strict";
import test from "node:test";
import { LifecycleCoordinator } from "../src/main/agent/lifecycle-coordinator.ts";
import { SettingsMutationTransaction } from "../src/main/agent/settings-mutation-transaction.ts";

test("persistence failure restores a security-sensitive setting in memory and on disk", async () => {
  const state = { permissionMode: "approve" };
  let persisted = state.permissionMode;
  let persistenceCalls = 0;
  const mutations = new SettingsMutationTransaction(() => {
    persistenceCalls += 1;
    persisted = state.permissionMode;
    if (persistenceCalls === 1) throw new Error("disk write failed after mutation");
  });

  await assert.rejects(
    mutations.commit({
      context: "Permission-mode mutation",
      capture: () => state.permissionMode,
      mutate: () => {
        state.permissionMode = "full";
      },
      restore: (original) => {
        state.permissionMode = original;
      },
    }),
    /disk write failed after mutation/,
  );

  assert.equal(state.permissionMode, "approve");
  assert.equal(persisted, "approve");
  assert.equal(persistenceCalls, 2);
});

test("a partially applied live effect is compensated after settings are restored", async () => {
  const state = { disabledSkills: ["old-skill"] };
  let persisted = [...state.disabledSkills];
  let live = [...state.disabledSkills];
  const mutations = new SettingsMutationTransaction(() => {
    persisted = [...state.disabledSkills];
  });

  await assert.rejects(
    mutations.commit({
      context: "Skill visibility mutation",
      capture: () => ({
        settings: [...state.disabledSkills],
        live: [...live],
      }),
      mutate: () => {
        state.disabledSkills = ["new-skill"];
      },
      restore: (original) => {
        state.disabledSkills = [...original.settings];
      },
      effect: {
        failureMode: "compensate",
        apply: () => {
          live = ["new-skill"];
          throw new Error("reload failed after changing the loader");
        },
        compensate: (original) => {
          live = [...original.live];
        },
      },
    }),
    /reload failed after changing the loader/,
  );

  assert.deepEqual(state.disabledSkills, ["old-skill"]);
  assert.deepEqual(persisted, ["old-skill"]);
  assert.deepEqual(live, ["old-skill"]);
});

test("a strongly exception-safe session effect rolls settings back without replacing the old owner", async () => {
  const state = { workspaceDir: "C:\\old" };
  let persisted = state.workspaceDir;
  const lifecycle = new LifecycleCoordinator<{ id: string }>(() => {});
  const oldOwner = await lifecycle.replace(async () => ({ id: "old" }));
  const mutations = new SettingsMutationTransaction(() => {
    persisted = state.workspaceDir;
  });

  await assert.rejects(
    mutations.commit({
      context: "Workspace-directory mutation",
      capture: () => state.workspaceDir,
      mutate: () => {
        state.workspaceDir = "C:\\new";
      },
      restore: (original) => {
        state.workspaceDir = original;
      },
      effect: {
        failureMode: "strong",
        apply: async () => {
          await lifecycle.replace(async () => {
            assert.equal(lifecycle.current, oldOwner);
            throw new Error("candidate session failed");
          });
        },
      },
    }),
    /candidate session failed/,
  );

  assert.equal(state.workspaceDir, "C:\\old");
  assert.equal(persisted, "C:\\old");
  assert.equal(lifecycle.current, oldOwner);
});

test("compensation failures retain the initiating error and every rollback diagnostic", async () => {
  const state = { value: "old" };
  let persistenceCalls = 0;
  const mutations = new SettingsMutationTransaction(() => {
    persistenceCalls += 1;
    if (persistenceCalls > 1) throw new Error("persist rollback failed");
  });

  await assert.rejects(
    mutations.commit({
      context: "Diagnostic mutation",
      capture: () => state.value,
      mutate: () => {
        state.value = "new";
      },
      restore: (original) => {
        state.value = original;
      },
      effect: {
        failureMode: "compensate",
        apply: () => {
          throw new Error("live apply failed");
        },
        compensate: () => {
          throw new Error("live rollback failed");
        },
      },
    }),
    (error: unknown) => {
      assert(error instanceof AggregateError);
      assert.match(error.message, /live apply failed/);
      assert.match(error.message, /live rollback failed/);
      assert.match(error.message, /persist rollback failed/);
      assert.equal(error.errors.length, 3);
      return true;
    },
  );
});
