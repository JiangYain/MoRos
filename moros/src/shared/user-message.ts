import type { UiImageAttachment } from "./types.ts";
import { compactSkillText, userSkillText } from "./skill-display.ts";
import { splitWorkbenchFeedback, type WorkbenchFeedback } from "./workbench.ts";

export interface UserMessagePreviewInput {
  text: string;
  skillName?: string;
  feedback?: readonly WorkbenchFeedback[];
  images?: readonly UiImageAttachment[];
}

export function userMessagePreview(message: UserMessagePreviewInput, imageLabel = "Image attachment"): string | undefined {
  const text = message.text.trim();
  if (text) return text;
  if (message.skillName) return `Skill: ${message.skillName}`;
  const feedback = message.feedback?.find((item) => item.comment.trim())?.comment.trim();
  if (feedback) return feedback;
  if (message.images?.length) return imageLabel;
  return undefined;
}

/** Complete editable content; feedback evidence stays separate from the user's text. */
export interface UserMessageDraft {
  text: string;
  images: UiImageAttachment[];
  feedback: WorkbenchFeedback[];
}

export function projectUserMessage(text: string): { text: string; skillName?: string; feedback?: WorkbenchFeedback[] } {
  const content = splitWorkbenchFeedback(text);
  return { ...compactSkillText(content.text), ...(content.feedback ? { feedback: content.feedback } : {}) };
}

export function userMessageDraft(text: string, images: UiImageAttachment[] = []): UserMessageDraft {
  const display = projectUserMessage(text);
  return { text: userSkillText(display.text, display.skillName), images,
    feedback: (display.feedback ?? []).map((item) => ({ ...item, selected: true })) };
}
