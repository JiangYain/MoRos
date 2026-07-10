import type {
  AgentStats,
  AgentUiEvent,
  CompassApi,
  InitPayload,
  PermissionMode,
  ThinkingLevel,
  UiImageAttachment,
  UiSessionInfo,
  VoiceInputResult,
  WebRpcMethod,
} from "@shared/types";

interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

interface SpeechRecognitionResultEvent extends Event {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

async function rpc<T>(method: WebRpcMethod, args: unknown[] = []): Promise<T> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, args }),
  });

  let payload: RpcEnvelope<T>;
  try {
    payload = (await response.json()) as RpcEnvelope<T>;
  } catch {
    throw new Error(`Compass Web API returned ${response.status}.`);
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Compass Web API returned ${response.status}.`);
  }
  return payload.result as T;
}

async function initializeWebApi(): Promise<InitPayload> {
  const deadline = Date.now() + 8_000;
  let delay = 100;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await rpc<InitPayload>("init");
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolveRetry) => window.setTimeout(resolveRetry, delay));
      delay = Math.min(delay * 2, 800);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Compass Web API is unavailable.");
}

function startBrowserDictation(): Promise<VoiceInputResult> {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  if (!Recognition) {
    return Promise.resolve({ ok: false, error: "当前浏览器不支持语音识别，请使用最新版 Chrome 或桌面版。" });
  }

  return new Promise((resolveResult) => {
    const recognition = new Recognition();
    let settled = false;

    const finish = (result: VoiceInputResult): void => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    recognition.lang = navigator.language || "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      finish(text ? { ok: true, text } : { ok: false, error: "没有识别到语音内容。" });
      recognition.stop();
    };
    recognition.onerror = (event) => {
      const error =
        event.error === "not-allowed"
          ? "麦克风权限未开启。请在浏览器地址栏中允许 Compass 使用麦克风。"
          : `语音识别失败：${event.error}`;
      finish({ ok: false, error });
    };
    recognition.onend = () => finish({ ok: false, error: "没有识别到语音内容。" });

    try {
      recognition.start();
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function createWebApi(): CompassApi {
  return {
    init: initializeWebApi,
    prompt: (text: string, images?: UiImageAttachment[]) => rpc("prompt", [text, images]),
    abort: () => rpc<void>("abort"),
    newSession: () => rpc<InitPayload>("newSession"),
    openSession: (path) => rpc<InitPayload>("openSession", [path]),
    listSessions: () => rpc<UiSessionInfo[]>("listSessions"),
    renameSession: (path, name) => rpc("renameSession", [path, name]),
    deleteSession: (path) => rpc("deleteSession", [path]),
    archiveSession: (path) => rpc("archiveSession", [path]),
    setModel: (provider, id) => rpc("setModel", [provider, id]),
    setModelEnabled: (provider, id, enabled) =>
      rpc<InitPayload>("setModelEnabled", [provider, id, enabled]),
    setThinkingLevel: (level: ThinkingLevel) => rpc<AgentStats>("setThinkingLevel", [level]),
    setPermissionMode: (mode: PermissionMode) => rpc("setPermissionMode", [mode]),
    setApiKey: (provider, key) => rpc<InitPayload>("setApiKey", [provider, key]),
    loginProvider: (provider) => rpc<InitPayload>("loginProvider", [provider]),
    removeApiKey: (provider) => rpc<InitPayload>("removeApiKey", [provider]),
    runPrerequisiteAction: (actionId) =>
      rpc<InitPayload>("runPrerequisiteAction", [actionId]),
    setSkillEnabled: (name, enabled) =>
      rpc<InitPayload>("setSkillEnabled", [name, enabled]),
    addSkillDir: () => rpc<InitPayload | null>("addSkillDir"),
    removeSkillDir: (dir) => rpc<InitPayload>("removeSkillDir", [dir]),
    setWorkspaceDir: () => rpc<InitPayload | null>("setWorkspaceDir"),
    openPath: (path) => rpc<void>("openPath", [path]),
    startDictation: startBrowserDictation,
    onAgentEvent: (listener: (event: AgentUiEvent) => void) => {
      const source = new EventSource("/api/events");
      source.onmessage = (event) => {
        try {
          listener(JSON.parse(event.data) as AgentUiEvent);
        } catch {
          // Ignore malformed events; EventSource will continue receiving later updates.
        }
      };
      return () => source.close();
    },
    windowControl: () => undefined,
    onMaximizeChange: (listener) => {
      queueMicrotask(() => listener(false));
      return () => undefined;
    },
  };
}
