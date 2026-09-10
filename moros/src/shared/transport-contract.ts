import {
  isAppLanguage,
  isApprovalScope,
  isCommandExplanationLanguage,
  isComposerSendKey,
  isDependencyId,
  isPermissionMode,
  isQueuedMessageKind,
  isThinkingLevel,
  type ApprovalScope,
  type MorosBackendApi,
  type UiImageAttachment,
} from "./types.ts";
import { isQuickPromptList } from "./quick-prompts.ts";
import { decodeWorkbenchFeedback, decodeWorkbenchRequest, decodeWorkbenchScope } from "./workbench-contract.ts";

export type BackendMethod = keyof MorosBackendApi;

export type BackendOperationArguments<Method extends BackendMethod> =
  MorosBackendApi[Method] extends (...args: infer Args) => Promise<unknown> ? Args : never;

export type BackendOperationResult<Method extends BackendMethod> =
  MorosBackendApi[Method] extends (...args: never[]) => Promise<infer Result> ? Result : never;

interface BackendOperationSpec<Method extends BackendMethod> {
  readonly ipcChannel: string;
  readonly web: boolean;
  decode(args: readonly unknown[]): BackendOperationArguments<Method>;
  encode?(args: BackendOperationArguments<Method>): readonly unknown[];
}

type BackendOperationRegistry = {
  readonly [Method in BackendMethod]: BackendOperationSpec<Method>;
};

function argumentCount(args: readonly unknown[], minimum: number, maximum = minimum): void {
  if (args.length < minimum || args.length > maximum) {
    const expectation = minimum === maximum ? String(minimum) : `${minimum}-${maximum}`;
    throw new Error(`Expected ${expectation} argument(s), received ${args.length}.`);
  }
}

function noArgs(args: readonly unknown[]): [] {
  argumentCount(args, 0);
  return [];
}

function stringArg(args: readonly unknown[], index: number, label: string): string {
  const value = args[index];
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function optionalStringArg(args: readonly unknown[], index: number, label: string): string | undefined {
  const value = args[index];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

function booleanArg(args: readonly unknown[], index: number, label: string): boolean {
  const value = args[index];
  if (typeof value !== "boolean") throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalApprovalScopeArg(args: readonly unknown[], index: number): ApprovalScope | undefined {
  const value = args[index];
  if (value === undefined || value === null) return undefined;
  if (!isApprovalScope(value)) throw new Error('scope must be "once" or "session".');
  return value;
}

function dependencyIdArg(args: readonly unknown[], index: number): Parameters<MorosBackendApi["installDependency"]>[0] {
  const value = args[index];
  if (!isDependencyId(value)) throw new Error("Invalid dependency id.");
  return value;
}

function imageAttachmentsArg(args: readonly unknown[], index: number): UiImageAttachment[] | undefined {
  const value = args[index];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 8) {
    throw new Error("images must be an array of up to 8 items.");
  }
  return value.map((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      throw new Error("Invalid image attachment.");
    }
    const image = candidate as Record<string, unknown>;
    if (
      typeof image.data !== "string"
      || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(String(image.mimeType))
    ) {
      throw new Error("Invalid image attachment.");
    }
    return {
      data: image.data,
      mimeType: image.mimeType as UiImageAttachment["mimeType"],
      ...(typeof image.name === "string" ? { name: image.name } : {}),
    };
  });
}

function oneString(label: string): (args: readonly unknown[]) => [string] {
  return (args) => {
    argumentCount(args, 1);
    return [stringArg(args, 0, label)];
  };
}

function optionalOneString(label: string): (args: readonly unknown[]) => [string?] {
  return (args) => {
    argumentCount(args, 0, 1);
    const value = optionalStringArg(args, 0, label);
    return value === undefined ? [] : [value];
  };
}

function twoStrings(firstLabel: string, secondLabel: string): (args: readonly unknown[]) => [string, string] {
  return (args) => {
    argumentCount(args, 2);
    return [stringArg(args, 0, firstLabel), stringArg(args, 1, secondLabel)];
  };
}

function oneDependencyId(args: readonly unknown[]): [Parameters<MorosBackendApi["installDependency"]>[0]] {
  argumentCount(args, 1);
  return [dependencyIdArg(args, 0)];
}

/**
 * The one source of truth for every backend operation transported by Moros.
 * Both Electron IPC and browser RPC register from this registry, while clients
 * derive their proxy methods from the same entries.
 */
export const BACKEND_OPERATION_SPECS = {
  workbench: { ipcChannel: "workbench:request", web: true, decode: (args) => { argumentCount(args, 1); return [decodeWorkbenchRequest(args[0])]; } },
  init: { ipcChannel: "app:init", web: true, decode: noArgs },
  getDeveloperContext: { ipcChannel: "developer:context", web: true, decode: noArgs },
  prompt: {
    ipcChannel: "agent:prompt",
    web: true,
    decode: (args) => {
      argumentCount(args, 1, 5);
      const feedbackIds = args[3];
      if (feedbackIds !== undefined && (!Array.isArray(feedbackIds) || feedbackIds.length > 40 || feedbackIds.some((id) => typeof id !== "string" || id.length > 200))) throw new Error("Invalid feedback IDs.");
      const decoded: BackendOperationArguments<"prompt"> = [
        stringArg(args, 0, "text"),
        imageAttachmentsArg(args, 1),
        optionalStringArg(args, 2, "clientMessageId"),
      ];
      if (feedbackIds !== undefined) decoded[3] = feedbackIds as string[];
      if (args[4] !== undefined) {
        if (!Array.isArray(args[4]) || args[4].length > 40 || JSON.stringify(args[4]).length > 16_000_000) throw new Error("Invalid recalled feedback.");
        decoded[4] = args[4].map(decodeWorkbenchFeedback);
      }
      return decoded;
    },
  },
  abort: { ipcChannel: "agent:abort", web: true, decode: noArgs },
  resolveApproval: {
    ipcChannel: "agent:resolve-approval",
    web: true,
    decode: (args) => {
      argumentCount(args, 2, 3);
      return [
        stringArg(args, 0, "id"),
        booleanArg(args, 1, "allowed"),
        optionalApprovalScopeArg(args, 2),
      ];
    },
  },
  removeQueuedMessage: {
    ipcChannel: "agent:remove-queued-message",
    web: true,
    decode: (args) => {
      argumentCount(args, 3, 4);
      if (!isQueuedMessageKind(args[0])) throw new Error("Invalid queued message kind.");
      const index = args[1];
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        throw new Error("index must be a non-negative integer.");
      }
      const decoded: BackendOperationArguments<"removeQueuedMessage"> = [args[0], index, stringArg(args, 2, "text")];
      if (args[3] !== undefined) decoded[3] = decodeWorkbenchScope(args[3]);
      return decoded;
    },
  },
  newSession: {
    ipcChannel: "agent:new-session",
    web: true,
    decode: optionalOneString("workspaceDir"),
  },
  openSession: { ipcChannel: "agent:open-session", web: true, decode: oneString("path") },
  listSessions: { ipcChannel: "sessions:list", web: true, decode: noArgs },
  searchSessionContent: {
    ipcChannel: "sessions:search-content",
    web: true,
    decode: oneString("query"),
  },
  renameSession: { ipcChannel: "sessions:rename", web: true, decode: twoStrings("path", "name") },
  deleteSession: { ipcChannel: "sessions:delete", web: true, decode: oneString("path") },
  archiveSession: { ipcChannel: "sessions:archive", web: true, decode: oneString("path") },
  listArchivedSessions: { ipcChannel: "sessions:list-archived", web: true, decode: noArgs },
  restoreArchivedSession: {
    ipcChannel: "sessions:restore-archived",
    web: true,
    decode: oneString("path"),
  },
  setModel: { ipcChannel: "models:set", web: true, decode: twoStrings("provider", "id") },
  setModelEnabled: {
    ipcChannel: "models:set-enabled",
    web: true,
    decode: (args) => {
      argumentCount(args, 3);
      return [
        stringArg(args, 0, "provider"),
        stringArg(args, 1, "id"),
        booleanArg(args, 2, "enabled"),
      ];
    },
  },
  setSummaryModel: {
    ipcChannel: "models:set-summary",
    web: true,
    decode: twoStrings("provider", "id"),
  },
  setThinkingLevel: {
    ipcChannel: "thinking:set",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (!isThinkingLevel(args[0])) throw new Error("Invalid thinking level.");
      return [args[0]];
    },
  },
  setPermissionMode: {
    ipcChannel: "permissions:set",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (!isPermissionMode(args[0])) throw new Error("Invalid permission mode.");
      return [args[0]];
    },
  },
  setLanguage: {
    ipcChannel: "settings:set-language",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (!isAppLanguage(args[0])) throw new Error("Invalid application language.");
      return [args[0]];
    },
  },
  setCommandExplanationLanguage: {
    ipcChannel: "settings:set-command-explanation-language",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (!isCommandExplanationLanguage(args[0])) {
        throw new Error("Invalid command explanation language.");
      }
      return [args[0]];
    },
  },
  setComposerSendKey: {
    ipcChannel: "settings:set-composer-send-key",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (!isComposerSendKey(args[0])) throw new Error("Invalid composer send key.");
      return [args[0]];
    },
  },
  setQuickPrompts: {
    ipcChannel: "settings:set-quick-prompts",
    web: true,
    decode: (args) => {
      argumentCount(args, 1);
      if (args[0] !== null && !isQuickPromptList(args[0])) {
        throw new Error("Quick prompts must contain between 1 and 5 non-empty items.");
      }
      return [args[0]];
    },
  },
  setApiKey: { ipcChannel: "auth:set-key", web: true, decode: twoStrings("provider", "key") },
  loginProvider: { ipcChannel: "auth:login-provider", web: true, decode: oneString("provider") },
  removeApiKey: { ipcChannel: "auth:remove", web: true, decode: oneString("provider") },
  runPrerequisiteAction: {
    ipcChannel: "runtime:prerequisite-action",
    web: true,
    decode: oneString("actionId"),
  },
  refreshDependencies: { ipcChannel: "dependencies:refresh", web: true, decode: noArgs },
  installDependency: {
    ipcChannel: "dependencies:install",
    web: true,
    decode: (args) => {
      argumentCount(args, 1, 2);
      return [dependencyIdArg(args, 0), optionalStringArg(args, 1, "sessionId")];
    },
  },
  cancelDependencyInstall: {
    ipcChannel: "dependencies:cancel",
    web: true,
    decode: oneDependencyId,
  },
  openDependencySource: {
    ipcChannel: "dependencies:open-source",
    web: true,
    decode: oneDependencyId,
  },
  refreshSkills: { ipcChannel: "skills:refresh", web: true, decode: noArgs },
  setSkillEnabled: {
    ipcChannel: "skills:set-enabled",
    web: true,
    decode: (args) => {
      argumentCount(args, 2);
      return [stringArg(args, 0, "name"), booleanArg(args, 1, "enabled")];
    },
  },
  addSkillDir: { ipcChannel: "skills:add-dir", web: true, decode: noArgs },
  removeSkillDir: { ipcChannel: "skills:remove-dir", web: true, decode: oneString("dir") },
  setWorkspaceDir: { ipcChannel: "settings:set-workspace", web: true, decode: noArgs },
  openPath: { ipcChannel: "shell:open-path", web: true, decode: oneString("path") },
  startDictation: {
    ipcChannel: "voice:start-dictation",
    web: false,
    decode: noArgs,
    // Desktop dictation emits text into the focused field; callbacks cannot be
    // structured-cloned across Electron IPC and are intentionally local-only.
    encode: () => [],
  },
} as const satisfies BackendOperationRegistry;

/** Browser-visible methods are derived from the registry's literal web flag. */
export type WebRpcMethod = {
  [Method in BackendMethod]:
    (typeof BACKEND_OPERATION_SPECS)[Method]["web"] extends true ? Method : never;
}[BackendMethod];

// Preserve the literal flags above for WebRpcMethod while exposing the same
// object through its correlated mapped type for generic decoder access.
const BACKEND_OPERATION_REGISTRY: BackendOperationRegistry = BACKEND_OPERATION_SPECS;

export const BACKEND_OPERATION_METHODS = Object.freeze(
  Object.keys(BACKEND_OPERATION_SPECS) as BackendMethod[],
);

export const WEB_RPC_METHODS = Object.freeze(
  BACKEND_OPERATION_METHODS.filter((method): method is WebRpcMethod => BACKEND_OPERATION_SPECS[method].web),
);

const WEB_RPC_METHOD_SET = new Set<string>(WEB_RPC_METHODS);

export function isWebRpcMethod(value: unknown): value is WebRpcMethod {
  return typeof value === "string" && WEB_RPC_METHOD_SET.has(value);
}

export function ipcChannelForBackendMethod(method: BackendMethod): string {
  return BACKEND_OPERATION_SPECS[method].ipcChannel;
}

function operationSpecification<Method extends BackendMethod>(
  method: Method,
): BackendOperationSpec<Method> {
  return BACKEND_OPERATION_REGISTRY[method];
}

export function decodeBackendArguments<Method extends BackendMethod>(
  method: Method,
  args: readonly unknown[],
): BackendOperationArguments<Method> {
  return operationSpecification(method).decode(args);
}

export function invokeBackendOperation<Method extends BackendMethod>(
  api: MorosBackendApi,
  method: Method,
  args: readonly unknown[],
): Promise<BackendOperationResult<Method>> {
  const operation = api[method] as (
    ...decodedArgs: BackendOperationArguments<Method>
  ) => Promise<BackendOperationResult<Method>>;
  return operation(...decodeBackendArguments(method, args));
}

export interface BackendTransportInvoker {
  <Method extends BackendMethod>(
  method: Method,
  encodedArgs: readonly unknown[],
  ): Promise<BackendOperationResult<Method>>;
}

export function createBackendTransportClient(invoke: BackendTransportInvoker): MorosBackendApi {
  return Object.fromEntries(BACKEND_OPERATION_METHODS.map((method) => {
    const specification = operationSpecification(method);
    const encode = specification.encode as
      | ((args: readonly unknown[]) => readonly unknown[])
      | undefined;
    return [
      method,
      (...args: unknown[]) => invoke(method, encode?.(args) ?? args),
    ];
  })) as MorosBackendApi;
}

export type WebRpcHandler<Method extends WebRpcMethod> = (
  args: readonly unknown[],
) => Promise<BackendOperationResult<Method>>;
export type WebRpcHandlers = {
  readonly [Method in WebRpcMethod]: WebRpcHandler<Method>;
};

export function createWebRpcHandlers(api: MorosBackendApi): WebRpcHandlers {
  return Object.fromEntries(WEB_RPC_METHODS.map((method) => [
    method,
    (args: readonly unknown[]) => invokeBackendOperation(api, method, args),
  ])) as WebRpcHandlers;
}
