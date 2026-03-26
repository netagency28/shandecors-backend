interface UploadResult {
    url: string;
    path: string;
    error?: string;
}
interface DeleteResult {
    success: boolean;
    error?: string;
}
declare class StorageService {
    private supabase;
    private bucketName;
    constructor();
    /**
     * Upload file to Supabase Storage
     */
    uploadFile(file: Buffer, fileName: string, contentType: string, path?: string): Promise<UploadResult>;
    /**
     * Delete file from Supabase Storage
     */
    deleteFile(filePath: string): Promise<DeleteResult>;
    /**
     * Get public URL for a file
     */
    getPublicUrl(filePath: string): string;
    /**
     * List files in a directory
     */
    listFiles(path?: string): Promise<{
        files: string[];
        error?: string;
    }>;
}
export declare const getStorageService: () => StorageService;
export default getStorageService;
//# sourceMappingURL=storage.d.ts.map