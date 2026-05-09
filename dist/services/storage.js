"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorageService = void 0;
exports.buildStoragePath = buildStoragePath;
const client_s3_1 = require("@aws-sdk/client-s3");
const lib_storage_1 = require("@aws-sdk/lib-storage");
const VIDEO_MIME = /^video\//;
/** Derive a clean storage path from upload context and file metadata. */
function buildStoragePath(type, originalName, mimeType) {
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
    constructor() {
        const endpoint = process.env.S3_ENDPOINT;
        const region = process.env.S3_REGION;
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
        const bucket = process.env.S3_BUCKET;
        const publicUrl = process.env.S3_PUBLIC_URL;
        if (!endpoint || !region || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
            throw new Error('Missing S3 config. Required: S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET, S3_PUBLIC_URL');
        }
        this.bucket = bucket;
        this.publicUrl = publicUrl.replace(/\/+$/, '');
        this.client = new client_s3_1.S3Client({
            endpoint,
            region,
            credentials: { accessKeyId, secretAccessKey },
            // Required for path-style URLs (Backblaze B2, MinIO, etc.)
            forcePathStyle: true,
        });
    }
    async uploadFile(file, storagePath, contentType) {
        try {
            // Use multipart upload via lib-storage — handles large files automatically
            const parallelUpload = new lib_storage_1.Upload({
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
        }
        catch (err) {
            return {
                url: '',
                path: '',
                error: err instanceof Error ? err.message : 'Upload failed',
            };
        }
    }
    async deleteFile(storagePath) {
        try {
            await this.client.send(new client_s3_1.DeleteObjectCommand({ Bucket: this.bucket, Key: storagePath }));
            return { success: true };
        }
        catch (err) {
            return {
                success: false,
                error: err instanceof Error ? err.message : 'Delete failed',
            };
        }
    }
    getPublicUrl(storagePath) {
        return `${this.publicUrl}/${storagePath}`;
    }
    async listFiles(prefix = '') {
        try {
            const resp = await this.client.send(new client_s3_1.ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix }));
            const files = (resp.Contents ?? []).map((o) => o.Key ?? '').filter(Boolean);
            return { files };
        }
        catch (err) {
            return {
                files: [],
                error: err instanceof Error ? err.message : 'List failed',
            };
        }
    }
}
let storageService = null;
const getStorageService = () => {
    if (!storageService) {
        storageService = new S3StorageService();
    }
    return storageService;
};
exports.getStorageService = getStorageService;
exports.default = exports.getStorageService;
//# sourceMappingURL=storage.js.map