const PROFILE_IMAGE_SIZE = 256;
const PROFILE_IMAGE_MAX_BYTES = 12 * 1024 * 1024;

export interface ProfileImageMessages {
  read: string;
  type: string;
  size: string;
  dimensions: string;
  processing: string;
}

function decodeImage(url: string, readError: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(readError));
    image.src = url;
  });
}

export async function prepareProfileImage(file: File, messages: ProfileImageMessages): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(messages.type);
  if (file.size > PROFILE_IMAGE_MAX_BYTES) throw new Error(messages.size);

  const url = URL.createObjectURL(file);
  try {
    const image = await decodeImage(url, messages.read);
    const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
    if (sourceSize <= 0) throw new Error(messages.dimensions);

    const sourceX = (image.naturalWidth - sourceSize) / 2;
    const sourceY = (image.naturalHeight - sourceSize) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = PROFILE_IMAGE_SIZE;
    canvas.height = PROFILE_IMAGE_SIZE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error(messages.processing);

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
