/**
 * StorageService — S3-compatible file storage (Backblaze B2 / AWS / Cloudflare R2 / DO Spaces)
 *
 * Folder structure:
 *   products/images/{ts}-{name}   ← product images
 *   products/videos/{ts}-{name}   ← product videos
 *   categories/{ts}-{name}        ← category images
 *   users/{ts}-{name}             ← user avatars
 *   site/{ts}-{name}              ← general assets
 *
 * Required env vars:
 *   S3_ENDPOINT        e.g. https://s3.us-west-004.backblazeb2.com
 *   S3_REGION          e.g. us-west-004
 *   S3_ACCESS_KEY_ID
 *   S3_SECRET_ACCESS_KEY
 *   S3_BUCKET          bucket name
 *   S3_PUBLIC_URL      base URL for public file access
 *                      e.g. https://my-bucket.s3.us-west-004.backblazeb2.com
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

interface UploadResult {
  url: string;
  path: string;
  error?: string;
}

interface DeleteResult {
  success: boolean;
  error?: string;
}

const VIDEO_MIME = /^video\//;

/** Derive a clean storage path from upload context and file metadata. */
export function buildStoragePath(
  type: string,
  originalName: string,
  mimeType: string
): string {
  const ts = Date.now();
  const safe = originalName
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

  switch (type) {
    case 'video':
      return `products/videos/${ts}-${safe}`;
    case 'product':
      return VIDEO_MIME.test(mimeType)
        ? `products/videos/${ts}-${safe}`
        : `products/images/${ts}-${safe}`;
    case 'category':
      return `categories/${ts}-${safe}`;
    case 'user':
      return `users/${ts}-${safe}`;
    default:
      return `site/${ts}-${safe}`;
  }
}

class S3StorageService {
  private client: S3Client;
  private bucket: string;
  private publicUrl: string;

  constructor() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const bucket = process.env.S3_BUCKET;
    const publicUrl = process.env.S3_PUBLIC_URL;

    if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
      throw new Error(
        'Missing S3 config. Required: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_URL'
      );
    }

    this.bucket = bucket;
    this.publicUrl = publicUrl.replace(/\/+$/, '');

    this.client = new S3Client({
      endpoint,
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Required for path-style URLs (Backblaze B2, MinIO, etc.)
      forcePathStyle: true,
    });
  }

  async uploadFile(
    file: Buffer,
    storagePath: string,
    contentType: string
  ): Promise<UploadResult> {
    try {
      // Use multipart upload via lib-storage — handles large files automatically
      const parallelUpload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: storagePath,
          Body: file,
          ContentType: contentType,
          CacheControl: 'public, max-age=31536000',
        },
      });

      await parallelUpload.done();

      return {
        url: `${this.publicUrl}/${storagePath}`,
        path: storagePath,
      };
    } catch (err) {
      return {
        url: '',
        path: '',
        error: err instanceof Error ? err.message : 'Upload failed',
      };
    }
  }

  async deleteFile(storagePath: string): Promise<DeleteResult> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: storagePath })
      );
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Delete failed',
      };
    }
  }

  getPublicUrl(storagePath: string): string {
    return `${this.publicUrl}/${storagePath}`;
  }

  async listFiles(prefix: string = ''): Promise<{ files: string[]; error?: string }> {
    try {
      const resp = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix })
      );
      const files = (resp.Contents ?? []).map((o) => o.Key ?? '').filter(Boolean);
      return { files };
    } catch (err) {
      return {
        files: [],
        error: err instanceof Error ? err.message : 'List failed',
      };
    }
  }
}

let storageService: S3StorageService | null = null;

export const getStorageService = (): S3StorageService => {
  if (!storageService) {
    storageService = new S3StorageService();
  }
  return storageService;
};

export default getStorageService;
