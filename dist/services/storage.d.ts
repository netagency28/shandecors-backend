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
interface UploadResult {
    url: string;
    path: string;
    error?: string;
}
interface DeleteResult {
    success: boolean;
    error?: string;
}
/** Derive a clean storage path from upload context and file metadata. */
export declare function buildStoragePath(type: string, originalName: string, mimeType: string): string;
declare class S3StorageService {
    private client;
    private bucket;
    private publicUrl;
    constructor();
    uploadFile(file: Buffer, storagePath: string, contentType: string): Promise<UploadResult>;
    deleteFile(storagePath: string): Promise<DeleteResult>;
    getPublicUrl(storagePath: string): string;
    listFiles(prefix?: string): Promise<{
        files: string[];
        error?: string;
    }>;
}
export declare const getStorageService: () => S3StorageService;
export default getStorageService;
//# sourceMappingURL=storage.d.ts.map