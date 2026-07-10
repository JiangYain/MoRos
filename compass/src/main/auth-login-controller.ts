import { shell } from "electron";
import type { AgentUiEvent, InitPayload } from "@shared/types";
import type { AgentService } from "./agent";

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

  async loginProvider(provider: string): Promise<InitPayload> {
    this.abortProvider(provider);
    const authController = new AbortController();
    this.activeLogins.set(provider, authController);

    try {
      await this.service.loginProvider(provider, {
        signal: authController.signal,
        onAuth: (info) => {
          const message = [info.instructions, info.url].filter(Boolean).join("\n");
          this.emitNotice("info", message || `正在打开 ${provider} 登录页面…`);
          void shell.openExternal(info.url);
        },
        onDeviceCode: (info) => {
          this.emitNotice("info", `Open ${info.verificationUri}\nCode: ${info.userCode}`);
          void shell.openExternal(info.verificationUri);
        },
        onPrompt: async (prompt) => {
          if (prompt.allowEmpty) return "";
          this.emitNotice(
            "warn",
            `${prompt.message}：当前桌面界面不支持手动输入回调码，请在打开的浏览器中完成本机回调。`,
          );
          return "";
        },
        onProgress: (message) => this.emitNotice("info", message),
        onManualCodeInput: () => this.waitForCancellation(provider, authController.signal),
        onSelect: async (prompt) => {
          const selected = prompt.options[0]?.id;
          this.emitNotice(
            "info",
            selected
              ? `${prompt.message}：已选择 ${prompt.options[0]?.label ?? selected}`
              : `${prompt.message}：没有可用选项。`,
          );
          return selected;
        },
      });
      return this.service.buildInitPayload();
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
}
