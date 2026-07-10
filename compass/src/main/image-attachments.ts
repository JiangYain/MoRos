import type { ImageContent } from "@earendil-works/pi-ai";
import type { UiImageAttachment } from "@shared/types";

const IMAGE_MIME_TYPES = new Set<UiImageAttachment["mimeType"]>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function normalizeImages(
  images: UiImageAttachment[] | undefined,
): ImageContent[] | undefined {
  if (!images?.length) return undefined;
  if (images.length > 8) throw new Error("一次最多附加 8 张图片。");

  let totalBytes = 0;
  const normalized = images.map((image) => {
    if (!IMAGE_MIME_TYPES.has(image.mimeType) || !image.data) {
      throw new Error("图片格式无效，仅支持 PNG、JPEG、WebP 与 GIF。");
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) {
      throw new Error("图片数据无效。");
    }
    const bytes = Buffer.byteLength(image.data, "base64");
    if (bytes > 10 * 1024 * 1024) throw new Error("单张图片不能超过 10 MB。");
    totalBytes += bytes;
    return { type: "image" as const, data: image.data, mimeType: image.mimeType };
  });

  if (totalBytes > 24 * 1024 * 1024) {
    throw new Error("图片附件总大小不能超过 24 MB。");
  }
  return normalized;
}
