import { shell } from "electron";
import type { AgentUiEvent, AppLanguage } from "@shared/types";
import type { AgentService } from "./agent";

const AUTH_COPY: Record<AppLanguage, {
  opening: string;
  manualCode: string;
  selected: string;
  noOptions: string;
}> = {
  "zh-CN": { opening: "正在打开 {provider} 登录页面…", manualCode: "当前桌面界面不支持手动输入回调码，请在打开的浏览器中完成本机回调。", selected: "已选择 {value}", noOptions: "没有可用选项。" },
  "zh-TW": { opening: "正在開啟 {provider} 登入頁面…", manualCode: "目前桌面介面不支援手動輸入回呼碼，請在開啟的瀏覽器中完成本機回呼。", selected: "已選擇 {value}", noOptions: "沒有可用選項。" },
  en: { opening: "Opening the {provider} sign-in page…", manualCode: "The desktop interface does not support manual callback-code entry. Complete the local callback in the open browser.", selected: "Selected {value}", noOptions: "No options are available." },
  de: { opening: "Die Anmeldeseite von {provider} wird geöffnet…", manualCode: "Die Desktop-Oberfläche unterstützt keine manuelle Eingabe des Rückrufcodes. Schließen Sie den lokalen Rückruf im geöffneten Browser ab.", selected: "{value} ausgewählt", noOptions: "Keine Optionen verfügbar." },
};

function authMessage(language: AppLanguage, key: keyof (typeof AUTH_COPY)[AppLanguage], values: Record<string, string> = {}): string {
  return Object.entries(values).reduce(
    (message, [name, value]) => message.replaceAll(`{${name}}`, value),
    AUTH_COPY[language][key],
  );
}

export class AuthLoginController {
  private readonly service: AgentService;
  private readonly emitEvent: (event: AgentUiEvent) => void;
  private readonly activeLogins = new Map<string, AbortController>();

  constructor(service: AgentService, emitEvent: (event: AgentUiEvent) => void) {
    this.service = service;
    this.emitEvent = emitEvent;
  }

  abortAll(): void {
    for (const controller of this.activeLogins.values()) {
      if (!controller.signal.aborted) {
        controller.abort();
      }
    }
    this.activeLogins.clear();
  }

  cancelProviderLogin(provider: string): void {
    this.abortProvider(provider);
  }

  async loginProvider(provider: string): Promise<void> {
    this.cancelProviderLogin(provider);
    const authController = new AbortController();
    this.activeLogins.set(provider, authController);

    try {
      const language = this.service.getSettingsView().language;
      await this.service.loginProvider(provider, {
        signal: authController.signal,
        prompt: async (prompt) => {
          if (prompt.type === "select") {
            const selected = prompt.options[0];
            this.emitNotice(
              "info",
              selected
                ? `${prompt.message}: ${authMessage(language, "selected", { value: selected.label })}`
                : `${prompt.message}: ${authMessage(language, "noOptions")}`,
            );
            if (!selected) throw new Error(authMessage(language, "noOptions"));
            return selected.id;
          }
          if (prompt.type === "manual_code") {
            this.emitNotice("warn", `${prompt.message}: ${authMessage(language, "manualCode")}`);
            return this.waitForCancellation(provider, prompt.signal ?? authController.signal);
          }
          this.emitNotice("warn", `${prompt.message}: ${authMessage(language, "manualCode")}`);
          return "";
        },
        notify: (event) => {
          if (event.type === "auth_url") {
            const message = [event.instructions, event.url].filter(Boolean).join("\n");
            this.emitNotice("info", message || authMessage(language, "opening", { provider }));
            this.openExternal(event.url);
          } else if (event.type === "device_code") {
            this.emitNotice("info", `Open ${event.verificationUri}\nCode: ${event.userCode}`);
            this.openExternal(event.verificationUri);
          } else if (event.type === "info") {
            const message = [event.message, ...(event.links ?? []).map((link) => link.url)].join("\n");
            this.emitNotice("info", message);
          } else {
            this.emitNotice("info", event.message);
          }
        },
      });
    } finally {
      if (!authController.signal.aborted) {
        authController.abort();
      }
      if (this.activeLogins.get(provider) === authController) {
        this.activeLogins.delete(provider);
      }
    }
  }

  private abortProvider(provider: string): void {
    const active = this.activeLogins.get(provider);
    if (active && !active.signal.aborted) {
      active.abort();
    }
  }

  private waitForCancellation(provider: string, signal: AbortSignal): Promise<string> {
    return new Promise((_resolve, reject) => {
      const cancel = (): void => reject(new Error(`Login cancelled for ${provider}`));
      if (signal.aborted) {
        cancel();
        return;
      }
      signal.addEventListener("abort", cancel, { once: true });
    });
  }

  private emitNotice(tone: "info" | "warn", text: string): void {
    this.emitEvent({
      kind: "notice",
      tone,
      text,
      ts: Date.now(),
    });
  }

  private openExternal(url: string): void {
    void shell.openExternal(url).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.emitNotice("warn", message);
    });
  }
}
