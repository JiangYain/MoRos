import type { ImageContent } from "@earendil-works/pi-ai";
import type { AppLanguage, UiImageAttachment } from "@shared/types";

const IMAGE_MIME_TYPES = new Set<UiImageAttachment["mimeType"]>([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export function normalizeImages(
  images: UiImageAttachment[] | undefined,
  language: AppLanguage = "zh-CN",
): ImageContent[] | undefined {
  const copy: Record<AppLanguage, [string, string, string, string, string]> = {
    "zh-CN": ["一次最多附加 8 张图片。", "图片格式无效，仅支持 PNG、JPEG、WebP 与 GIF。", "图片数据无效。", "单张图片不能超过 10 MB。", "图片附件总大小不能超过 24 MB。"],
    "zh-TW": ["一次最多附加 8 張圖片。", "圖片格式無效，僅支援 PNG、JPEG、WebP 與 GIF。", "圖片資料無效。", "單張圖片不可超過 10 MB。", "圖片附件總大小不可超過 24 MB。"],
    en: ["You can attach up to 8 images at once.", "Invalid image format. Only PNG, JPEG, WebP, and GIF are supported.", "Invalid image data.", "Each image must be 10 MB or smaller.", "Image attachments must total 24 MB or less."],
    de: ["Sie können bis zu 8 Bilder gleichzeitig anhängen.", "Ungültiges Bildformat. Unterstützt werden nur PNG, JPEG, WebP und GIF.", "Ungültige Bilddaten.", "Ein Bild darf höchstens 10 MB groß sein.", "Bildanhänge dürfen insgesamt höchstens 24 MB groß sein."],
  };
  const [tooMany, invalidFormat, invalidData, tooLarge, totalTooLarge] = copy[language];
  if (!images?.length) return undefined;
  if (images.length > 8) throw new Error(tooMany);

  let totalBytes = 0;
  const normalized = images.map((image) => {
    if (!IMAGE_MIME_TYPES.has(image.mimeType) || !image.data) {
      throw new Error(invalidFormat);
    }
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) {
      throw new Error(invalidData);
    }
    const bytes = Buffer.byteLength(image.data, "base64");
    if (bytes > 10 * 1024 * 1024) throw new Error(tooLarge);
    totalBytes += bytes;
    return { type: "image" as const, data: image.data, mimeType: image.mimeType };
  });

  if (totalBytes > 24 * 1024 * 1024) {
    throw new Error(totalTooLarge);
  }
  return normalized;
}
