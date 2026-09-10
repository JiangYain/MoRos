import type { AgentSession } from "@earendil-works/pi-coding-agent";
import type { AppLanguage, UiImageAttachment } from "../../shared/types.ts";
import { formatWorkbenchFeedback, type WorkbenchFeedback, type WorkbenchScope } from "../../shared/workbench.ts";
import type { WorkbenchService } from "../workbench/service.ts";
import { normalizeImages } from "../image-attachments.ts";
import { queuedDraftRecorder } from "./queued-messages.ts";

interface Submission {
  session: Pick<AgentSession, "prompt" | "isStreaming">;
  scope: WorkbenchScope;
  language: AppLanguage;
  supportsImages: boolean;
  text: string;
  images?: UiImageAttachment[];
  feedbackIds?: string[];
  recalledFeedback?: WorkbenchFeedback[];
  workbench?: Pick<WorkbenchService, "register" | "takeFeedback" | "restoreFeedback">;
}

export async function submitPrompt(input: Submission): Promise<void> {
  const { session, scope, text, workbench } = input;
  let consumed: WorkbenchFeedback[] = [];
  let accepted = false;
  try {
    if (input.feedbackIds?.length) {
      if (!workbench) throw new Error("WB_FEEDBACK_GONE");
      await workbench.register(scope);
      consumed = await workbench.takeFeedback(scope, input.feedbackIds);
    }
    const feedback = [...new Map([...consumed, ...(input.recalledFeedback ?? [])].map((item) => [item.id, item])).values()];
    const images = input.images ?? [];
    const screenshots: UiImageAttachment[] = input.supportsImages ? feedback.flatMap((item) => item.screenshot?.startsWith("data:image/png;base64,")
      ? [{ data: item.screenshot.slice("data:image/png;base64,".length), mimeType: "image/png" as const, name: "annotation.png" }] : []) : [];
    const normalized = normalizeImages([...images, ...screenshots.slice(0, Math.max(0, 8 - images.length))], input.language);
    const remember = queuedDraftRecorder(session, { text, images, feedback }, normalized ?? []);
    await session.prompt(text + formatWorkbenchFeedback(feedback), {
      images: normalized,
      ...(session.isStreaming ? { streamingBehavior: "steer" as const } : {}),
      preflightResult: (success) => {
        accepted = success;
        if (success) remember();
      },
    });
  } catch (error) {
    if (!accepted && consumed.length) await workbench?.restoreFeedback(scope, consumed);
    throw error;
  }
}
