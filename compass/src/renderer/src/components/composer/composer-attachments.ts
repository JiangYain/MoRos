import type { UiImageAttachment } from "@shared/types";
import type { useI18n } from "../../i18n";

export interface ComposerAttachment extends UiImageAttachment {
  id: string;
}

const SUPPORTED_IMAGE_TYPES: readonly UiImageAttachment["mimeType"][] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

function isSupportedImageType(value: string): value is UiImageAttachment["mimeType"] {
  return SUPPORTED_IMAGE_TYPES.some((type) => type === value);
}

function attachmentId(): string {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `image-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function readComposerImage(
  file: File,
  t: ReturnType<typeof useI18n>["t"],
): Promise<ComposerAttachment> {
  const mimeType = file.type;
  if (!isSupportedImageType(mimeType)) {
    return Promise.reject(new Error(t("composer.imageOnly")));
  }
  if (file.size > 10 * 1024 * 1024) {
    return Promise.reject(new Error(t("composer.imageTooLarge")));
  }
  return new Promise((resolveImage, rejectImage) => {
    const reader = new FileReader();
    reader.onerror = () => rejectImage(new Error(t("composer.imageReadFailed", { name: file.name || "clipboard image" })));
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.includes(",")) {
        rejectImage(new Error(t("composer.imageInvalid")));
        return;
      }
      resolveImage({
        id: attachmentId(),
        data: reader.result.slice(reader.result.indexOf(",") + 1),
        mimeType,
        name: file.name || "Pasted image",
      });
    };
    reader.readAsDataURL(file);
  });
}
