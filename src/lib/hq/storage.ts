import "server-only";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Files people share in HQ, kept in Neon object storage (S3-compatible). It switches on when the
// bucket's details are in the environment: HQ_FILES_BUCKET plus the AWS_* variables Neon injects
// (AWS_ENDPOINT_URL_S3, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION). Postgres keeps only
// each file's key; downloads are short-lived signed links handed out after an access check.

export const MAX_FILE = 4 * 1024 * 1024;

export const filesOn = () => Boolean(process.env.HQ_FILES_BUCKET && process.env.AWS_ENDPOINT_URL_S3 && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

let client: S3Client | null = null;
// Neon needs path-style addressing; credentials, endpoint and region come from the AWS_* variables
const s3 = () => (client ??= new S3Client({ forcePathStyle: true, region: process.env.AWS_REGION || "us-east-1" }));
const bucket = () => process.env.HQ_FILES_BUCKET!;

/** Types people can share: pictures, video, PDFs, office documents and plain text. */
export const okType = (t: string) =>
  /^(image\/(png|jpe?g|gif|webp|heic)|video\/(mp4|quicktime|webm)|application\/pdf|text\/(plain|csv)|application\/(msword|vnd\.openxmlformats-officedocument\.[\w.]+|vnd\.ms-(excel|powerpoint)))$/.test(t);

export async function putFile(key: string, body: Uint8Array, type: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: type }));
}

/** A link that works for five minutes. */
export async function fileUrl(key: string, name: string) {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket(), Key: key, ResponseContentDisposition: `inline; filename="${name.replace(/["\\\r\n]/g, "")}"` }),
    { expiresIn: 300 },
  );
}
