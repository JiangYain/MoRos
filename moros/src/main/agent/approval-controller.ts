import {
  type ExtensionFactory,
  type ModelRegistry,
} from "@earendil-works/pi-coding-agent";
import type { Api, Model } from "@earendil-works/pi-ai";
import { completeSimple } from "@earendil-works/pi-ai/compat";
import type {
  AgentUiEvent,
  AppLanguage,
  ApprovalScope,
  PermissionMode,
  UiApprovalRequest,
} from "@shared/types";
import { DEFAULT_SUMMARY_MODEL } from "../../shared/types.ts";
import {
  buildApprovalExplanationContext,
  normalizeGeneratedApprovalExplanation,
  resolveApprovalExplanationLanguage,
} from "../approval-explanation.ts";
import { evaluateToolApproval } from "../permission-policy.ts";
import type { AppSettings } from "../settings";
import { cloneForUi } from "../thread-projector.ts";

type ToolApprovalDecision = undefined | { block: true; reason: string };

interface PendingApproval {
  request: UiApprovalRequest;
  resolve(decision: ToolApprovalDecision): void;
  timer: ReturnType<typeof setTimeout>;
  explanationAbort: AbortController;
}

export type ApprovalExplainer = (
  request: UiApprovalRequest,
  signal: AbortSignal,
) => Promise<string | undefined>;

export interface ApprovalControllerOptions {
  emit(event: AgentUiEvent): void;
  nextId(prefix: string): string;
  policy(): { mode: PermissionMode; workspaceDir: string };
  explain: ApprovalExplainer;
  timeoutMs?: number;
}

const APPROVAL_TIMEOUT_MS = 10 * 60 * 1_000;

const APPROVAL_EXPLANATION_LANGUAGES: Record<AppLanguage, string> = {
  "zh-CN": "Simplified Chinese",
  "zh-TW": "Traditional Chinese",
  en: "English",
  de: "German",
};

/**
 * Owns the complete approval lifecycle: policy evaluation, pending state,
 * timeout, best-effort explanation, resolution, and renderer events.
 */
export class ApprovalController {
  private readonly pending = new Map<string, PendingApproval>();
  /** Tools the operator allowed for the rest of this live session; never persisted. */
  private readonly sessionAllowedTools = new Set<string>();
  private readonly options: ApprovalControllerOptions;

  constructor(options: ApprovalControllerOptions) {
    this.options = options;
  }

  extension(
    policy: ApprovalControllerOptions["policy"] = this.options.policy,
  ): ExtensionFactory {
    return (pi) => {
      pi.on("tool_call", async (event) => {
        const currentPolicy = policy();
        const approval = evaluateToolApproval(
          currentPolicy.mode,
          currentPolicy.workspaceDir,
          event.toolName,
          event.input,
        );
        if (!approval) return undefined;
        if (this.sessionAllowedTools.has(event.toolName)) return undefined;
        return this.request(approval.message, approval.detail, event.toolName, event.input);
      });
    };
  }

  snapshot(): UiApprovalRequest[] {
    return [...this.pending.values()].map(({ request }) => ({ ...request }));
  }

  resolve(id: string, allowed: boolean, scope: ApprovalScope = "once"): { ok: boolean; error?: string } {
    if (allowed && scope === "session") {
      const pending = this.pending.get(id);
      if (pending) this.sessionAllowedTools.add(pending.request.toolName);
    }
    const resolved = this.finish(
      id,
      allowed ? undefined : { block: true, reason: "The operator denied this action." },
    );
    return resolved ? { ok: true } : { ok: false, error: "Approval request is no longer active." };
  }

  cancelAll(reason: string): void {
    for (const id of [...this.pending.keys()]) {
      this.finish(id, { block: true, reason });
    }
  }

  private request(
    message: string,
    detail: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolApprovalDecision> {
    const request: UiApprovalRequest = {
      id: this.options.nextId("approval"),
      toolName,
      message,
      detail,
      args: cloneForUi(args),
      explanationPending: true,
      ts: Date.now(),
    };

    return new Promise<ToolApprovalDecision>((resolveDecision) => {
      const explanationAbort = new AbortController();
      const timer = setTimeout(() => {
        this.finish(request.id, {
          block: true,
          reason: "The approval request expired before the operator responded.",
        });
      }, this.options.timeoutMs ?? APPROVAL_TIMEOUT_MS);
      timer.unref();
      this.pending.set(request.id, {
        request,
        resolve: resolveDecision,
        timer,
        explanationAbort,
      });
      this.options.emit({ kind: "approval-request", request });
      void this.explain(request.id);
    });
  }

  private async explain(id: string): Promise<void> {
    const pending = this.pending.get(id);
    if (!pending) return;
    let explanation: string | undefined;
    try {
      explanation = await this.options.explain(pending.request, pending.explanationAbort.signal);
    } catch {
      // Explanation is best-effort and must never block the operator decision.
    } finally {
      this.publishExplanation(id, explanation);
    }
  }

  private publishExplanation(id: string, explanation?: string): void {
    const pending = this.pending.get(id);
    if (!pending) return;
    pending.request.explanation = explanation;
    pending.request.explanationPending = false;
    this.options.emit({ kind: "approval-explanation", id, explanation });
  }

  private finish(id: string, decision: ToolApprovalDecision): boolean {
    const pending = this.pending.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    pending.explanationAbort.abort();
    this.pending.delete(id);
    this.options.emit({ kind: "approval-resolved", id });
    pending.resolve(decision);
    return true;
  }
}

export function createApprovalExplainer(options: {
  settings(): AppSettings;
  registry(): ModelRegistry;
  isConnectable(model: Model<Api>): boolean;
}): ApprovalExplainer {
  return async (request, signal) => {
    const context = buildApprovalExplanationContext(request);
    if (!context) return undefined;

    const settings = options.settings();
    const selection = settings.summaryModel ?? DEFAULT_SUMMARY_MODEL;
    const registry = options.registry();
    const model = registry.find(selection.provider, selection.id);
    if (!model || !options.isConnectable(model)) return undefined;

    const auth = await registry.getApiKeyAndHeaders(model);
    if (!auth.ok) return undefined;
    const explanationLanguage = resolveApprovalExplanationLanguage(
      settings.commandExplanationLanguage,
      settings.language,
    );
    const response = await completeSimple(
      model,
      {
        systemPrompt: [
          "Explain what the requested tool action will do in exactly one concise sentence.",
          `Write in ${APPROVAL_EXPLANATION_LANGUAGES[explanationLanguage]}.`,
          "Describe the concrete intent and main effect without recommending whether to approve it.",
          "Return only the sentence with no markdown, label, or preamble.",
        ].join(" "),
        messages: [{ role: "user", content: context, timestamp: Date.now() }],
      },
      {
        apiKey: auth.apiKey,
        headers: auth.headers,
        env: auth.env,
        maxTokens: 140,
        reasoning: "minimal",
        signal,
      },
    );
    if (response.stopReason === "error" || response.stopReason === "aborted") return undefined;
    return normalizeGeneratedApprovalExplanation(
      response.content
        .filter((content) => content.type === "text")
        .map((content) => content.text)
        .join("\n"),
    ) ?? undefined;
  };
}
