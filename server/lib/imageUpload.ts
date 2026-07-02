import { promises as fs } from "fs";
import path from "path";
import {
  uploadBufferToObjectStorage,
  makeObjectKey,
  isObjectStorageConfigured,
  localFallbackAllowed,
  type UploadFolder,
} from "./objectStorage";

export function detectUploadedImageFormat(buffer: Buffer): "jpg" | "png" | "webp" | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WEBP: RIFF....WEBP
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "webp";
  }

  return null;
}

export function decodeImageDataUrlToBuffer(dataUrl: string): Buffer | null {
  if (typeof dataUrl !== "string") return null;
  const trimmed = dataUrl.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return null;

  try {
    const base64 = match[2].replace(/\s+/g, "");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length === 0) return null;
    const MAX_BYTES = 5 * 1024 * 1024; // 5 MB server-side hard cap
    if (buffer.length > MAX_BYTES) {
      throw new Error("Image exceeds maximum allowed size of 5 MB.");
    }
    return buffer;
  } catch (err: any) {
    if (err?.message?.startsWith("Image exceeds")) throw err;
    return null;
  }
}

export async function persistUploadedImage(buffer: Buffer, dir: string): Promise<{ filename: string; format: "jpg" | "png" | "webp" }> {
  const format = detectUploadedImageFormat(buffer);
  if (!format) {
    throw new Error("Unsupported file content. Upload JPG, PNG, or WebP.");
  }

  const contentTypeMap = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
  const folder = path.basename(dir) as UploadFolder;
  const key = makeObjectKey(folder, `image.${format}`);
  const filename = key.split("/").pop()!;

  if (!isObjectStorageConfigured() && localFallbackAllowed()) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buffer);
    return { filename, format };
  }

  await uploadBufferToObjectStorage({ buffer, key, contentType: contentTypeMap[format] });

  // Return just the base filename so callers can build /uploads/<folder>/<filename> as before
  return { filename, format };
}

/**
 * Persist an arbitrary uploaded file (e.g. a PDF) with the SAME durability
 * guarantee as persistUploadedImage: object storage is the only write path in
 * production (or whenever S3 is configured) and throws on failure — the local
 * fallback is dev-only. Returns the `/uploads/<folder>/<filename>` path so
 * callers stay backward-compatible with resolveStoredUploadPath().
 */
export async function persistUploadedFile(
  buffer: Buffer,
  folder: UploadFolder,
  opts: { contentType: string; ext: string },
): Promise<{ storagePath: string; filename: string }> {
  const key = makeObjectKey(folder, `file.${opts.ext}`);
  const filename = key.split("/").pop()!;
  const storagePath = `/uploads/${folder}/${filename}`;

  if (!isObjectStorageConfigured() && localFallbackAllowed()) {
    const dir = path.join(process.cwd(), "server/uploads", folder);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), buffer);
    return { storagePath, filename };
  }

  await uploadBufferToObjectStorage({ buffer, key, contentType: opts.contentType });
  return { storagePath, filename };
}
