const PROFILE_IMAGE_SIZE = 256;
const PROFILE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

function decodeImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("无法读取这张图片。"));
    image.src = url;
  });
}

export async function prepareProfileImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("请选择图片文件。");
  if (file.size > PROFILE_IMAGE_MAX_BYTES) throw new Error("头像图片不能超过 12 MB。");

  const url = URL.createObjectURL(file);
  try {
    const image = await decodeImage(url);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (sourceSize <= 0) throw new Error("图片尺寸无效。");

    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_IMAGE_SIZE;
    canvas.height = PROFILE_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前环境无法处理头像图片。");

    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(
      image,
      sourceX,
      sourceY,
      sourceSize,
      sourceSize,
      0,
      0,
      PROFILE_IMAGE_SIZE,
      PROFILE_IMAGE_SIZE,
    );
    return canvas.toDataURL("image/webp", 0.88);
  } finally {
    URL.revokeObjectURL(url);
  }
}
