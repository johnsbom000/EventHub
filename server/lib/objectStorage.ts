import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import crypto from "crypto";

function getConfig() {
  const bucket = process.env.OBJECT_STORAGE_BUCKET;
  const endpoint = process.env.OBJECT_STORAGE_ENDPOINT;
  const accessKeyId = process.env.OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY;
  const region = process.env.OBJECT_STORAGE_REGION || "auto";
  const publicBaseUrl = process.env.OBJECT_STORAGE_PUBLIC_BASE_URL;

  if (!bucket) throw new Error("Missing OBJECT_STORAGE_BUCKET");
  if (!endpoint) throw new Error("Missing OBJECT_STORAGE_ENDPOINT");
  if (!accessKeyId) throw new Error("Missing OBJECT_STORAGE_ACCESS_KEY_ID");
  if (!secretAccessKey) throw new Error("Missing OBJECT_STORAGE_SECRET_ACCESS_KEY");
  if (!publicBaseUrl) throw new Error("Missing OBJECT_STORAGE_PUBLIC_BASE_URL");

  return { bucket, endpoint, accessKeyId, secretAccessKey, region, publicBaseUrl };
}

function buildClient() {
  const { endpoint, accessKeyId, secretAccessKey, region } = getConfig();
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export type UploadFolder = "listings" | "vendor-shops";

export function makeObjectKey(folder: UploadFolder, originalName?: string): string {
  const safeOriginal = (originalName || "image.jpg").replace(/[^a-zA-Z0-9._-]/g, "-");
  const ext = safeOriginal.includes(".") ? safeOriginal.split(".").pop() : "jpg";
  const safeExt = (ext || "jpg").replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "jpg";

  return `${folder}/${crypto.randomUUID()}.${safeExt}`;
}

export async function uploadBufferToObjectStorage(params: {
  buffer: Buffer;
  key: string;
  contentType?: string;
}): Promise<{ key: string; url: string }> {
  const { bucket, publicBaseUrl } = getConfig();
  const client = buildClient();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: params.key,
      Body: params.buffer,
      ContentType: params.contentType || "application/octet-stream",
    })
  );

  const url = `${publicBaseUrl.replace(/\/$/, "")}/${params.key}`;
  return { key: params.key, url };
}

export function resolveStoredUploadPath(pathOrUrl?: string | null): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const { publicBaseUrl } = getConfig();
  const cleanBase = publicBaseUrl.replace(/\/$/, "");

  // Legacy local path like /uploads/listings/uuid.jpg → full CDN URL
  if (pathOrUrl.startsWith("/uploads/")) {
    const key = pathOrUrl.replace(/^\/uploads\//, "");
    return `${cleanBase}/${key}`;
  }

  return pathOrUrl;
}
