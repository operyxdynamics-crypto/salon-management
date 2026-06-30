import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PlatformError } from "./platform-auth";

type StoredObject = {
  key: string;
  size: number;
  contentType: string;
};

const provider = process.env.STORAGE_PROVIDER ?? "local";
const localRoot = path.join(process.cwd(), ".data", "uploads");

function signingSecret() {
  const value = process.env.AUTH_SECRET;
  if (!value) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("AUTH_SECRET must be set in production");
    }
    return "development-only-secret-change-before-deploying";
  }
  return value;
}

function safeKey(key: string) {
  // Normalize Windows-style separators so traversal sequences like "..\\foo" can't sneak through.
  const cleaned = key.replace(/\\/g, "/");
  const normalized = path.posix.normalize(cleaned).replace(/^(\.\.\/)+/, "");
  if (normalized.startsWith("../") || path.isAbsolute(normalized) || normalized.includes("\0")) {
    throw new PlatformError("STORAGE_ERROR", "Invalid storage key", 400);
  }
  return normalized;
}

function s3Client() {
  return new S3Client({
    region: process.env.S3_REGION ?? "auto",
    endpoint: process.env.S3_ENDPOINT,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY ? {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    } : undefined,
  });
}

export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<StoredObject> {
  const storageKey = safeKey(key);
  if (provider === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new PlatformError("STORAGE_ERROR", "S3 bucket is not configured", 500);
    await s3Client().send(new PutObjectCommand({ Bucket: bucket, Key: storageKey, Body: bytes, ContentType: contentType }));
  } else {
    const filePath = path.join(localRoot, ...storageKey.split("/"));
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
  }
  return { key: storageKey, size: bytes.byteLength, contentType };
}

export async function getLocalObject(key: string) {
  if (provider === "s3") throw new PlatformError("STORAGE_ERROR", "Object is stored remotely", 409);
  return readFile(path.join(localRoot, ...safeKey(key).split("/")));
}

export async function signedObjectUrl(documentId: string, storageKey: string, expiresInSeconds = 300) {
  if (provider === "s3") {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new PlatformError("STORAGE_ERROR", "S3 bucket is not configured", 500);
    return getSignedUrl(s3Client(), new GetObjectCommand({ Bucket: bucket, Key: storageKey }), { expiresIn: expiresInSeconds });
  }
  const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const payload = `${documentId}.${expires}`;
  const signature = createHmac("sha256", signingSecret())
    .update(payload)
    .digest("hex");
  return `/api/v1/documents/${documentId}/file?expires=${expires}&signature=${signature}`;
}

export function verifyLocalSignature(documentId: string, expires: string | null, signature: string | null) {
  if (!expires || !signature || Number(expires) < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", signingSecret())
    .update(`${documentId}.${expires}`)
    .digest("hex");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function storageProvider() {
  return provider;
}
