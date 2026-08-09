import assert from "node:assert/strict";
import test from "node:test";
import type { CompassBackendApi } from "../src/shared/types.ts";
import {
  type BackendMethod,
  type BackendOperationArguments,
  type BackendOperationResult,
  type BackendTransportInvoker,
  BACKEND_OPERATION_METHODS,
  BACKEND_OPERATION_SPECS,
  createBackendTransportClient,
  createWebRpcHandlers,
  decodeBackendArguments,
  ipcChannelForBackendMethod,
  isWebRpcMethod,
  WEB_RPC_METHODS,
} from "../src/shared/transport-contract.ts";

const ARGUMENTS = {
  init: [],
  getDeveloperContext: [],
  prompt: ["hello", [{ data: "AA==", mimeType: "image/png", name: "sample.png" }], "client-message-1"],
  abort: [],
  resolveApproval: ["approval-1", true],
  newSession: [],
  openSession: ["C:\\sessions\\one.jsonl"],
  listSessions: [],
  renameSession: ["C:\\sessions\\one.jsonl", "One"],
  deleteSession: ["C:\\sessions\\one.jsonl"],
  archiveSession: ["C:\\sessions\\one.jsonl"],
  importLegacyClientRegistry: ["{}"],
  saveClientProfile: [{
    name: "Client A",
    gender: null,
    age: null,
    contact: "",
    notes: "",
    hearingAidBrands: ["phonak"],
  }],
  assignSessionClient: ["session-1", "Client A"],
  unassignSessionClient: ["session-1"],
  setModel: ["openai", "gpt-test"],
  setModelEnabled: ["openai", "gpt-test", false],
  setSummaryModel: ["openai", "gpt-test"],
  setThinkingLevel: ["high"],
  setPermissionMode: ["approve"],
  setLanguage: ["de"],
  setCommandExplanationLanguage: ["auto"],
  setQuickPrompts: [["First prompt"]],
  setApiKey: ["openai", "secret"],
  loginProvider: ["openai"],
  removeApiKey: ["openai"],
  runPrerequisiteAction: ["install-git"],
  refreshDependencies: [],
  installDependency: ["bash", "session-1"],
  cancelDependencyInstall: ["bash"],
  openDependencySource: ["bash"],
  selectDependencyExecutable: ["phonak-target", "C:\\Target\\Target.exe"],
  resetDependencyExecutable: ["phonak-target"],
  setSkillEnabled: ["skill-a", true],
  addSkillDir: [],
  removeSkillDir: ["C:\\skills"],
  setWorkspaceDir: [],
  openPath: ["C:\\workspace"],
  startDictation: [() => undefined],
} satisfies { [Method in BackendMethod]: BackendOperationArguments<Method> };

test("backend transport registry has one unique Electron channel per operation", () => {
  const channels = BACKEND_OPERATION_METHODS.map(ipcChannelForBackendMethod);
  assert.equal(new Set(channels).size, channels.length);
  assert.deepEqual(
    WEB_RPC_METHODS,
    BACKEND_OPERATION_METHODS.filter((method) => method !== "startDictation"),
  );
  assert.equal(isWebRpcMethod("setLanguage"), true);
  assert.equal(isWebRpcMethod("startDictation"), false);
  assert.equal(isWebRpcMethod("missing"), false);
  assert.equal(Object.keys(BACKEND_OPERATION_SPECS).length, BACKEND_OPERATION_METHODS.length);
});

test("transport clients derive every method and preserve its encoded arguments", async () => {
  const calls: Array<{ method: string; args: readonly unknown[] }> = [];
  const invoke = (async (method: BackendMethod, args: readonly unknown[]) => {
    calls.push({ method, args });
    return { method, args };
  }) as BackendTransportInvoker;
  const client = createBackendTransportClient(invoke);

  for (const method of BACKEND_OPERATION_METHODS) {
    const operation = client[method] as (...args: readonly unknown[]) => Promise<unknown>;
    const result = await operation(...ARGUMENTS[method]);
    const expectedArgs = method === "startDictation" ? [] : ARGUMENTS[method];
    assert.deepEqual(result, { method, args: expectedArgs });
  }

  assert.deepEqual(calls.map((call) => call.method), BACKEND_OPERATION_METHODS);
  const typedResult: BackendOperationResult<"setModel"> = { ok: true };
  assert.deepEqual(typedResult, { ok: true });
});

test("the shared decoder validates both Electron and web arguments", () => {
  assert.deepEqual(decodeBackendArguments("setLanguage", ["de"]), ["de"]);
  assert.deepEqual(decodeBackendArguments("installDependency", ["bash", null]), ["bash", undefined]);
  assert.throws(() => decodeBackendArguments("setLanguage", ["fr"]), /Invalid application language/);
  assert.throws(() => decodeBackendArguments("setModelEnabled", ["openai", "gpt-test", "yes"]), /enabled must be a boolean/);
  assert.throws(() => decodeBackendArguments("init", ["unexpected"]), /Expected 0 argument/);
});

test("web handlers adapt every browser method over the backend interface", async () => {
  const calls: Array<{ method: PropertyKey; args: unknown[] }> = [];
  const backend = new Proxy({}, {
    get: (_target, method) => (...args: unknown[]) => {
      calls.push({ method, args });
      return Promise.resolve({ method, args });
    },
  }) as CompassBackendApi;
  const handlers = createWebRpcHandlers(backend);

  for (const method of WEB_RPC_METHODS) {
    const handler = handlers[method] as (args: readonly unknown[]) => Promise<unknown>;
    await handler(ARGUMENTS[method]);
  }

  assert.deepEqual(calls.map((call) => call.method), WEB_RPC_METHODS);
  assert.deepEqual(Object.keys(handlers), WEB_RPC_METHODS);
});
