"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStorageService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
class StorageService {
    constructor() {
        this.bucketReady = false;
        if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
            throw new Error('SUPABASE_URL and SUPABASE_KEY are required for StorageService');
        }
        this.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
        this.bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
    }
    /** Create the bucket if it doesn't exist — called once before the first upload. */
    async ensureBucket() {
        if (this.bucketReady)
            return;
        const { data: buckets, error: listErr } = await this.supabase.storage.listBuckets();
        if (listErr) {
            console.warn('⚠️  Could not list Supabase buckets:', listErr.message);
            return;
        }
        const exists = (buckets ?? []).some((b) => b.name === this.bucketName);
        if (!exists) {
            const { error: createErr } = await this.supabase.storage.createBucket(this.bucketName, {
                public: true,
                allowedMimeTypes: [
                    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                    'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg',
                ],
                fileSizeLimit: 100 * 1024 * 1024, // 100 MB
            });
            if (createErr) {
                console.warn(`⚠️  Could not create bucket "${this.bucketName}":`, createErr.message);
                return;
            }
            console.log(`✅ Supabase bucket "${this.bucketName}" created (public).`);
        }
        this.bucketReady = true;
    }
    async uploadFile(file, fileName, contentType, path = '') {
        try {
            await this.ensureBucket();
            const filePath = path ? `${path}/${fileName}` : fileName;
            const { error } = await this.supabase.storage
                .from(this.bucketName)
                .upload(filePath, file, {
                contentType,
                cacheControl: '3600',
                upsert: true,
            });
            if (error) {
                return { url: '', path: '', error: error.message };
            }
            const { data: { publicUrl } } = this.supabase.storage
                .from(this.bucketName)
                .getPublicUrl(filePath);
            return { url: publicUrl, path: filePath };
        }
        catch (error) {
            return {
                url: '',
                path: '',
                error: error instanceof Error ? error.message : 'Upload failed',
            };
        }
    }
    async deleteFile(filePath) {
        try {
            const { error } = await this.supabase.storage
                .from(this.bucketName)
                .remove([filePath]);
            if (error)
                return { success: false, error: error.message };
            return { success: true };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Delete failed',
            };
        }
    }
    getPublicUrl(filePath) {
        const { data: { publicUrl } } = this.supabase.storage
            .from(this.bucketName)
            .getPublicUrl(filePath);
        return publicUrl;
    }
    async listFiles(path = '') {
        try {
            const { data, error } = await this.supabase.storage
                .from(this.bucketName)
                .list(path);
            if (error)
                return { files: [], error: error.message };
            const files = data?.map((file) => file.name) || [];
            return { files };
        }
        catch (error) {
            return {
                files: [],
                error: error instanceof Error ? error.message : 'List failed',
            };
        }
    }
}
let storageService = null;
const getStorageService = () => {
    if (!storageService) {
        storageService = new StorageService();
    }
    return storageService;
};
exports.getStorageService = getStorageService;
exports.default = exports.getStorageService;
//# sourceMappingURL=storage.js.map