import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@/server/db";
import { files } from "@/server/db/schema";
import { env } from "@/server/env";
import { BusinessError } from "@/server/services/errors";

/**
 * Storage de arquivos (§68): binários fora do PostgreSQL; no banco ficam só metadados.
 * Driver "local" (pasta) para desenvolvimento/servidor único, "s3" para qualquer
 * serviço compatível (AWS S3, Cloudflare R2, MinIO, Backblaze, Wasabi…).
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
}

const localDriver: StorageDriver = {
  async put(key, body) {
    const full = path.resolve(env.STORAGE_LOCAL_DIR, key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  },
  async get(key) {
    const root = path.resolve(env.STORAGE_LOCAL_DIR);
    const full = path.resolve(root, key);
    if (!full.startsWith(root + path.sep)) throw new Error("Caminho inválido");
    return readFile(full);
  },
};

function s3Driver(): StorageDriver {
  if (!env.S3_BUCKET) throw new Error("S3_BUCKET não configurado");
  const client = new S3Client({
    region: env.S3_REGION ?? "auto",
    endpoint: env.S3_ENDPOINT || undefined,
    forcePathStyle: !!env.S3_ENDPOINT,
    credentials: env.S3_ACCESS_KEY_ID ? { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" } : undefined,
  });
  return {
    async put(key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }));
    },
    async get(key) {
      const r = await client.send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
      return Buffer.from(await r.Body!.transformToByteArray());
    },
  };
}

let driver: StorageDriver | null = null;
export function storage(): StorageDriver {
  driver ??= env.STORAGE_DRIVER === "s3" ? s3Driver() : localDriver;
  return driver;
}

/** Tipos aceitos — validados pelo conteúdo (assinatura), não só pela extensão. */
const ALLOWED: Record<string, { kind: string; ext: string; max: number }> = {
  "image/jpeg": { kind: "photo", ext: "jpg", max: 15 },
  "image/png": { kind: "photo", ext: "png", max: 15 },
  "image/webp": { kind: "photo", ext: "webp", max: 15 },
  "video/mp4": { kind: "video", ext: "mp4", max: 200 },
  "application/pdf": { kind: "pdf", ext: "pdf", max: 30 },
  "text/csv": { kind: "sheet", ext: "csv", max: 10 },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "sheet", ext: "xlsx", max: 20 },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "document", ext: "docx", max: 20 },
};

function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.subarray(0, 4).toString() === "RIFF" && buf.subarray(8, 12).toString() === "WEBP") return "image/webp";
  if (buf.subarray(4, 8).toString() === "ftyp") return "video/mp4";
  if (buf.subarray(0, 5).toString() === "%PDF-") return "application/pdf";
  if (buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "zip";
  return null;
}

export async function saveUpload(companyId: string, userId: string, file: File, folder: string) {
  if (!file || file.size === 0) throw new BusinessError("Selecione um arquivo.");
  const buf = Buffer.from(await file.arrayBuffer());
  const detected = sniff(buf);
  let mime = file.type;
  if (detected === "zip" && (mime.includes("openxmlformats"))) {
    /* xlsx/docx são zip — aceita pelo tipo declarado */
  } else if (mime === "text/csv" && !detected) {
    /* csv é texto puro */
  } else if (detected && detected !== "zip") {
    mime = detected;
  } else {
    throw new BusinessError("Tipo de arquivo não permitido. Envie foto (JPG/PNG/WEBP), vídeo MP4, PDF, CSV, XLSX ou DOCX.");
  }
  const rule = ALLOWED[mime];
  if (!rule) throw new BusinessError("Tipo de arquivo não permitido.");
  if (file.size > rule.max * 1024 * 1024) throw new BusinessError(`Arquivo muito grande (máximo ${rule.max} MB).`);
  const safeFolder = folder.replace(/[^a-z0-9/_-]/gi, "");
  const key = `${companyId}/${safeFolder}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${rule.ext}`;
  await storage().put(key, buf, mime);
  const [row] = await db
    .insert(files)
    .values({ companyId, storageKey: key, originalName: file.name.slice(0, 255), mimeType: mime, sizeBytes: file.size, kind: rule.kind, uploadedBy: userId })
    .returning();
  return row;
}
