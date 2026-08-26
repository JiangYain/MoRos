import assert from "node:assert/strict";
import test from "node:test";
import type {
  AgentSession,
  ModelRegistry,
  ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import type { AppSettings } from "../src/main/settings.ts";
import { ModelCoordinator } from "../src/main/agent/model-coordinator.ts";

const stats = {
  sessionId: "session-1",
  workspaceDir: "C:\\workspace",
  modelAuthConfigured: true,
  thinkingLevel: "off" as const,
  isStreaming: false,
  contextPercent: null,
  contextTokens: null,
  contextWindow: 0,
  cost: 0,
  tokensIn: 0,
  tokensOut: 0,
};

test("model snapshots expose provider-mapped thinking levels", () => {
  const mappedModel = {
    provider: "test",
    id: "mapped",
    name: "Mapped",
    reasoning: true,
    thinkingLevelMap: { minimal: null, xhigh: null, max: "max" },
    input: ["text"],
    contextWindow: 1,
  } as unknown as Model<Api>;
  const registry = {
    getAvailable: () => [mappedModel],
    getProviderDisplayName: () => "Test",
    hasConfiguredAuth: () => true,
  } as unknown as ModelRegistry;
  const settings: AppSettings = {
    language: "en",
    commandExplanationLanguage: "auto",
    workspaceDir: "C:\\workspace",
    skillDirs: [],
    disabledSkills: [],
    permissionMode: "full",
    summaryModel: { provider: "test", id: "mapped" },
    enabledModels: ["test::mapped"],
    composerSendKey: "enter",
  };
  const coordinator = new ModelCoordinator({
    state: () => ({ settings, runtime: {} as ModelRuntime, registry }),
    persist: () => undefined,
    emitStats: () => undefined,
    providerAuthInfo: () => ({ supportsApiKey: true, envVars: [], requiredEnv: [] }),
    providerConfigurationIssue: () => undefined,
    snapshot: () => ({
      settings: {
        language: settings.language,
        commandExplanationLanguage: settings.commandExplanationLanguage,
        workspaceDir: settings.workspaceDir,
        skillDirs: [],
        disabledSkills: [],
        permissionMode: settings.permissionMode,
        enabledModels: [...settings.enabledModels],
        summaryModel: settings.summaryModel,
        composerSendKey: settings.composerSendKey,
      },
      stats,
    }),
  });

  assert.deepEqual(coordinator.models()[0]?.thinkingLevels, ["off", "low", "medium", "high", "max"]);
});

test("model coordinator switches the live session before committing a disabled current model", async () => {
  const first = { provider: "test", id: "first", name: "First" } as Model<Api>;
  const second = { provider: "test", id: "second", name: "Second" } as Model<Api>;
  const available = [first, second];
  const registry = {
    find: (provider: string, id: string) =>
      available.find((model) => String(model.provider) === provider && model.id === id),
    getAvailable: () => available,
    hasConfiguredAuth: () => true,
  } as unknown as ModelRegistry;
  const settings: AppSettings = {
    language: "en",
    commandExplanationLanguage: "auto",
    workspaceDir: "C:\\workspace",
    skillDirs: [],
    disabledSkills: [],
    permissionMode: "full",
    defaultModel: { provider: "test", id: "first" },
    summaryModel: { provider: "test", id: "first" },
    enabledModels: ["test::first", "test::second"],
  };
  const order: string[] = [];
  const mutableSession = {
    model: first,
    setModel: async (model: Model<Api>) => {
      order.push(`session:${model.id}`);
      mutableSession.model = model;
    },
  };
  const coordinator = new ModelCoordinator({
    state: () => ({
      settings,
      runtime: {} as ModelRuntime,
      registry,
      session: mutableSession as unknown as AgentSession,
    }),
    persist: () => order.push("persist"),
    emitStats: () => order.push("stats"),
    providerAuthInfo: () => ({
      supportsApiKey: true,
      envVars: [],
      requiredEnv: [],
    }),
    providerConfigurationIssue: () => undefined,
    snapshot: () => ({
      settings: {
        language: settings.language,
        commandExplanationLanguage: settings.commandExplanationLanguage,
        workspaceDir: settings.workspaceDir,
        skillDirs: [],
        disabledSkills: [],
        permissionMode: settings.permissionMode,
        enabledModels: [...settings.enabledModels],
        summaryModel: settings.summaryModel,
      },
      stats,
    }),
  });

  const result = await coordinator.setEnabled("test", "first", false);
  assert.deepEqual(order, ["session:second", "persist", "stats"]);
  assert.equal(mutableSession.model, second);
  assert.deepEqual(settings.defaultModel, { provider: "test", id: "second" });
  assert.deepEqual(settings.enabledModels, ["test::second"]);
  assert.deepEqual(result.settings.enabledModels, ["test::second"]);
});

test("credential and selection mutations share the service-level queue", async () => {
  let releaseLogin!: () => void;
  const loginCanFinish = new Promise<void>((resolve) => {
    releaseLogin = resolve;
  });
  const order: string[] = [];
  const settings: AppSettings = {
    language: "en",
    commandExplanationLanguage: "auto",
    workspaceDir: "C:\\workspace",
    skillDirs: [],
    disabledSkills: [],
    permissionMode: "full",
    enabledModels: [],
  };
  const registry = {
    find: () => {
      order.push("selection");
      return undefined;
    },
    getAvailable: () => [],
  } as unknown as ModelRegistry;
  const runtime = {
    login: async () => {
      order.push("credential:start");
      await loginCanFinish;
      order.push("credential:end");
    },
  } as unknown as ModelRuntime;
  const coordinator = new ModelCoordinator({
    state: () => ({ settings, runtime, registry }),
    persist: () => undefined,
    emitStats: () => undefined,
    providerAuthInfo: () => ({ supportsApiKey: true, envVars: [], requiredEnv: [] }),
    providerConfigurationIssue: () => undefined,
    snapshot: () => ({
      settings: {
        language: "en",
        commandExplanationLanguage: "auto",
        workspaceDir: settings.workspaceDir,
        skillDirs: [],
        disabledSkills: [],
        permissionMode: "full",
        enabledModels: [],
        summaryModel: { provider: "test", id: "summary" },
      },
      stats,
    }),
  });

  const credential = coordinator.saveApiKey("test", "secret");
  const selection = coordinator.select("test", "model");
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(order, ["credential:start"]);

  releaseLogin();
  await Promise.all([credential, selection]);
  assert.deepEqual(order, ["credential:start", "credential:end", "selection"]);
});

function preferenceFailureHarness(options: {
  persist(call: number): void;
  failLiveRollback?: boolean;
  firstProvider?: string;
  secondProvider?: string;
  noInitialLiveModel?: boolean;
}) {
  const firstProvider = options.firstProvider ?? "test";
  const secondProvider = options.secondProvider ?? "test";
  const first = { provider: firstProvider, id: "first", name: "First" } as Model<Api>;
  const second = { provider: secondProvider, id: "second", name: "Second" } as Model<Api>;
  const available = [first, second];
  let loggedOutProvider: string | undefined;
  const registry = {
    find: (provider: string, id: string) =>
      available.find((model) => String(model.provider) === provider && model.id === id),
    getAvailable: () => available,
    hasConfiguredAuth: (model: Model<Api>) => String(model.provider) !== loggedOutProvider,
  } as unknown as ModelRegistry;
  const settings: AppSettings = {
    language: "en",
    commandExplanationLanguage: "auto",
    workspaceDir: "C:\\workspace",
    skillDirs: [],
    disabledSkills: [],
    permissionMode: "full",
    defaultModel: { provider: firstProvider, id: "first" },
    summaryModel: { provider: firstProvider, id: "first" },
    enabledModels: [`${firstProvider}::first`, `${secondProvider}::second`],
  };
  const order: string[] = [];
  let persistCalls = 0;
  let statsCalls = 0;
  const mutableSession: { model: Model<Api> | undefined; setModel(model: Model<Api>): Promise<void> } = {
    model: options.noInitialLiveModel ? undefined : first,
    setModel: async (model: Model<Api>) => {
      order.push(`session:${model.id}`);
      if (options.failLiveRollback && model.id === "first") {
        throw new Error("rollback model failure");
      }
      mutableSession.model = model;
    },
  };
  const runtime = {
    login: async () => {
      order.push("login");
    },
    logout: async (provider: string) => {
      order.push(`logout:${provider}`);
      loggedOutProvider = provider;
    },
  } as unknown as ModelRuntime;
  const coordinator = new ModelCoordinator({
    state: () => ({
      settings,
      runtime,
      registry,
      session: mutableSession as unknown as AgentSession,
    }),
    persist: () => {
      persistCalls += 1;
      order.push(`persist:${persistCalls}`);
      options.persist(persistCalls);
    },
    emitStats: () => {
      statsCalls += 1;
      order.push("stats");
    },
    providerAuthInfo: () => ({ supportsApiKey: true, envVars: [], requiredEnv: [] }),
    providerConfigurationIssue: () => undefined,
    snapshot: () => ({
      settings: {
        language: settings.language,
        commandExplanationLanguage: settings.commandExplanationLanguage,
        workspaceDir: settings.workspaceDir,
        skillDirs: [],
        disabledSkills: [],
        permissionMode: settings.permissionMode,
        enabledModels: [...settings.enabledModels],
        summaryModel: settings.summaryModel,
      },
      stats,
    }),
  });
  return {
    coordinator,
    first,
    second,
    mutableSession,
    settings,
    order,
    statsCalls: () => statsCalls,
    firstProvider,
    secondProvider,
  };
}

test("selection persistence failure restores preferences and the original live model", async () => {
  const harness = preferenceFailureHarness({
    persist: (call) => {
      if (call === 1) throw new Error("selection persistence failure");
    },
  });

  const result = await harness.coordinator.select("test", "second");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /selection persistence failure/);
  assert.equal(harness.mutableSession.model, harness.first);
  assert.deepEqual(harness.settings.defaultModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, ["test::first", "test::second"]);
  assert.deepEqual(harness.order, [
    "session:second",
    "persist:1",
    "session:first",
    "persist:2",
  ]);
  assert.equal(harness.statsCalls(), 0);
});

test("selection with no original live model persists before switching", async () => {
  const harness = preferenceFailureHarness({
    noInitialLiveModel: true,
    persist: (call) => {
      if (call === 1) throw new Error("first-model persistence failure");
    },
  });

  const result = await harness.coordinator.select("test", "second");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /first-model persistence failure/);
  assert.equal(harness.mutableSession.model, undefined);
  assert.deepEqual(harness.settings.defaultModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, ["test::first", "test::second"]);
  assert.deepEqual(harness.order, ["persist:1", "persist:2"]);
});

test("disabling the current model rolls back its replacement when persistence fails", async () => {
  const harness = preferenceFailureHarness({
    persist: (call) => {
      if (call === 1) throw new Error("disable persistence failure");
    },
  });

  await assert.rejects(
    harness.coordinator.setEnabled("test", "first", false),
    /disable persistence failure/,
  );
  assert.equal(harness.mutableSession.model, harness.first);
  assert.deepEqual(harness.settings.defaultModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, ["test::first", "test::second"]);
  assert.deepEqual(harness.order, [
    "session:second",
    "persist:1",
    "session:first",
    "persist:2",
  ]);
  assert.equal(harness.statsCalls(), 0);
});

test("selection reports the initiating and compensation failures together", async () => {
  const harness = preferenceFailureHarness({
    failLiveRollback: true,
    persist: (call) => {
      throw new Error(call === 1 ? "primary disk failure" : "rollback disk failure");
    },
  });

  const result = await harness.coordinator.select("test", "second");
  assert.equal(result.ok, false);
  assert.match(result.error ?? "", /primary disk failure/);
  assert.match(result.error ?? "", /rollback model failure/);
  assert.match(result.error ?? "", /rollback disk failure/);
  assert.deepEqual(harness.settings.defaultModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, ["test::first", "test::second"]);
  assert.equal(harness.mutableSession.model, harness.second);
  assert.equal(harness.statsCalls(), 0);
});

test("summary persistence failure restores the prior summary selection", async () => {
  const harness = preferenceFailureHarness({
    persist: (call) => {
      if (call === 1) throw new Error("summary persistence failure");
    },
  });

  await assert.rejects(
    harness.coordinator.setSummary("test", "second"),
    /summary persistence failure/,
  );
  assert.deepEqual(harness.settings.summaryModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.order, ["persist:1", "persist:2"]);
  assert.equal(harness.mutableSession.model, harness.first);
});

test("preference normalization restores memory when persistence fails", async () => {
  const harness = preferenceFailureHarness({
    persist: (call) => {
      if (call === 1) throw new Error("normalization persistence failure");
    },
  });
  harness.settings.defaultModel = { provider: "missing", id: "missing" };
  harness.settings.enabledModels = [];

  await assert.rejects(
    harness.coordinator.normalizePreferences(),
    /normalization persistence failure/,
  );
  assert.deepEqual(harness.settings.defaultModel, { provider: "missing", id: "missing" });
  assert.deepEqual(harness.settings.enabledModels, []);
  assert.deepEqual(harness.order, ["persist:1", "persist:2"]);
  assert.equal(harness.mutableSession.model, harness.first);
});

test("auth synchronization does not swallow a persistence failure", async () => {
  const harness = preferenceFailureHarness({
    persist: (call) => {
      if (call === 1) throw new Error("auth sync persistence failure");
    },
  });

  await assert.rejects(
    harness.coordinator.saveApiKey("test", "secret"),
    /auth sync persistence failure/,
  );
  assert.equal(harness.mutableSession.model, harness.first);
  assert.deepEqual(harness.settings.defaultModel, { provider: "test", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, ["test::first", "test::second"]);
  assert.deepEqual(harness.order, [
    "login",
    "session:first",
    "persist:1",
    "persist:2",
  ]);
  assert.equal(harness.statsCalls(), 0);
});

test("logout replacement rolls back the live model and normalized preferences on persistence failure", async () => {
  const harness = preferenceFailureHarness({
    firstProvider: "provider-one",
    secondProvider: "provider-two",
    persist: (call) => {
      if (call === 1) throw new Error("logout persistence failure");
    },
  });

  await assert.rejects(
    harness.coordinator.logout("provider-one"),
    /logout persistence failure/,
  );
  assert.equal(harness.mutableSession.model, harness.first);
  assert.deepEqual(harness.settings.defaultModel, { provider: "provider-one", id: "first" });
  assert.deepEqual(harness.settings.enabledModels, [
    "provider-one::first",
    "provider-two::second",
  ]);
  assert.deepEqual(harness.order, [
    "logout:provider-one",
    "persist:1",
    "persist:2",
  ]);
  assert.equal(harness.statsCalls(), 0);
});

test("logout persists its replacement preference before leaving an unauthenticated live model", async () => {
  const harness = preferenceFailureHarness({
    firstProvider: "provider-one",
    secondProvider: "provider-two",
    persist: () => {},
  });

  await harness.coordinator.logout("provider-one");
  assert.equal(harness.mutableSession.model, harness.second);
  assert.deepEqual(harness.settings.defaultModel, { provider: "provider-two", id: "second" });
  assert.deepEqual(harness.order, [
    "logout:provider-one",
    "persist:1",
    "session:second",
    "stats",
  ]);
  assert.equal(harness.statsCalls(), 1);
});
