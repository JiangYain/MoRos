import type {
  AgentUiEvent,
  CompassApi,
  InitPayload,
  VoiceInputResult,
  VoiceInputUpdate,
} from "@shared/types";
import { isAppLanguage, type AppLanguage } from "@shared/types";
import {
  type BackendMethod,
  type BackendOperationResult,
  type BackendTransportInvoker,
  type WebRpcMethod,
  createBackendTransportClient,
  isWebRpcMethod,
} from "@shared/transport-contract";
import { createWebAgentEvents } from "./web-agent-events";

type WebMessageKey = "apiUnavailable" | "speechUnsupported" | "speechEmpty" | "microphoneDenied" | "speechFailed";

const WEB_MESSAGES: Record<AppLanguage, Record<WebMessageKey, string>> = {
  "zh-CN": {
    apiUnavailable: "Compass Web API 暂不可用。",
    speechUnsupported: "当前浏览器不支持语音识别，请使用最新版 Chrome 或桌面版。",
    speechEmpty: "没有识别到语音内容。",
    microphoneDenied: "麦克风权限未开启。请在浏览器地址栏中允许 Compass 使用麦克风。",
    speechFailed: "语音识别失败：{error}",
  },
  "zh-TW": {
    apiUnavailable: "Compass Web API 目前無法使用。",
    speechUnsupported: "目前瀏覽器不支援語音辨識，請使用最新版 Chrome 或桌面版。",
    speechEmpty: "沒有辨識到語音內容。",
    microphoneDenied: "尚未開啟麥克風權限。請在瀏覽器網址列允許 Compass 使用麥克風。",
    speechFailed: "語音辨識失敗：{error}",
  },
  en: {
    apiUnavailable: "Compass Web API is unavailable.",
    speechUnsupported: "This browser does not support speech recognition. Use the latest Chrome or the desktop app.",
    speechEmpty: "No speech was recognized.",
    microphoneDenied: "Microphone access is disabled. Allow Compass to use the microphone in the browser address bar.",
    speechFailed: "Speech recognition failed: {error}",
  },
  de: {
    apiUnavailable: "Die Compass Web API ist nicht verfügbar.",
    speechUnsupported: "Dieser Browser unterstützt keine Spracherkennung. Verwenden Sie die aktuelle Chrome-Version oder die Desktop-App.",
    speechEmpty: "Es wurde keine Sprache erkannt.",
    microphoneDenied: "Der Mikrofonzugriff ist deaktiviert. Erlauben Sie Compass den Mikrofonzugriff in der Adressleiste.",
    speechFailed: "Spracherkennung fehlgeschlagen: {error}",
  },
};

function webMessage(key: WebMessageKey, values: Record<string, string> = {}): string {
  const language = isAppLanguage(document.documentElement.lang) ? document.documentElement.lang : "zh-CN";
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    WEB_MESSAGES[language][key],
  );
}

interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

interface SpeechRecognitionResultLike extends ArrayLike<{ transcript: string }> {
  isFinal: boolean;
}

interface SpeechRecognitionResultEvent extends Event {
  results: ArrayLike<SpeechRecognitionResultLike>;
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
  onstart: (() => void) | null;
  start(): void;
  stop(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

async function rpc<Method extends WebRpcMethod>(
  method: Method,
  args: readonly unknown[] = [],
): Promise<BackendOperationResult<Method>> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, args }),
  });

  let payload: RpcEnvelope<BackendOperationResult<Method>>;
  try {
    payload = (await response.json()) as RpcEnvelope<BackendOperationResult<Method>>;
  } catch {
    throw new Error(`Compass Web API returned ${response.status}.`);
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `Compass Web API returned ${response.status}.`);
  }
  return payload.result as BackendOperationResult<Method>;
}

async function initializeWebApi(): Promise<InitPayload> {
  const deadline = Date.now() + 8_000;
  let delay = 100;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      return await rpc("init");
    } catch (error) {
      lastError = error;
      await new Promise<void>((resolveRetry) => window.setTimeout(resolveRetry, delay));
      delay = Math.min(delay * 2, 800);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(webMessage("apiUnavailable"));
}

function startBrowserDictation(onUpdate?: (update: VoiceInputUpdate) => void): Promise<VoiceInputResult> {
  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  const Recognition = browserWindow.SpeechRecognition ?? browserWindow.webkitSpeechRecognition;
  if (!Recognition) {
    return Promise.resolve({ ok: false, error: webMessage("speechUnsupported") });
  }

  return new Promise((resolveResult) => {
    const recognition = new Recognition();
    let settled = false;
    let latestTranscript = "";

    const finish = (result: VoiceInputResult): void => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    recognition.lang = document.documentElement.lang || navigator.language || "zh-CN";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => onUpdate?.({ phase: "listening" });
    recognition.onresult = (event) => {
      const results = Array.from(event.results);
      const text = results
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      latestTranscript = text;
      const complete = results.some((result) => result.isFinal);
      onUpdate?.({ phase: complete ? "processing" : "listening", interimText: text });
      if (complete) {
        finish(text ? { ok: true, text } : { ok: false, error: webMessage("speechEmpty") });
        recognition.stop();
      }
    };
    recognition.onerror = (event) => {
      const error =
        event.error === "not-allowed"
          ? webMessage("microphoneDenied")
          : webMessage("speechFailed", { error: event.error });
      finish({ ok: false, error });
    };
    recognition.onend = () => finish(
      latestTranscript
        ? { ok: true, text: latestTranscript }
        : { ok: false, error: webMessage("speechEmpty") },
    );

    try {
      onUpdate?.({ phase: "starting" });
      recognition.start();
    } catch (error) {
      finish({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });
}

export function createWebApi(): CompassApi {
  const eventSource = new EventSource("/api/events");
  const agentEvents = createWebAgentEvents(
    {
      onMessage: (listener) => {
        eventSource.onmessage = (event) => listener(event.data);
      },
      onOpen: (listener) => {
        eventSource.onopen = () => listener();
      },
    },
    () => rpc("init"),
  );
  const invokeWebBackend: BackendTransportInvoker = <Method extends BackendMethod>(
    method: Method,
    args: readonly unknown[],
  ): Promise<BackendOperationResult<Method>> => {
    if (!isWebRpcMethod(method)) {
      return Promise.reject(new Error(`Backend method ${method} is not available over browser RPC.`));
    }
    return rpc(method, args);
  };
  const backend = createBackendTransportClient(invokeWebBackend);

  return {
    ...backend,
    init: async () => {
      const [payload] = await Promise.all([initializeWebApi(), agentEvents.ready]);
      return payload;
    },
    startDictation: startBrowserDictation,
    onAgentEvent: (listener: (event: AgentUiEvent) => void) => agentEvents.subscribe(listener),
    windowControl: () => undefined,
    onMaximizeChange: (listener) => {
      queueMicrotask(() => listener(false));
      return () => undefined;
    },
  };
}
