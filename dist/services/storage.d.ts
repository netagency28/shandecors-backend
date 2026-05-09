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
    private bucketReady;
    constructor();
    /** Create the bucket if it doesn't exist — called once before the first upload. */
    private ensureBucket;
    uploadFile(file: Buffer, fileName: string, contentType: string, path?: string): Promise<UploadResult>;
    deleteFile(filePath: string): Promise<DeleteResult>;
    getPublicUrl(filePath: string): string;
    listFiles(path?: string): Promise<{
        files: string[];
        error?: string;
    }>;
}
export declare const getStorageService: () => StorageService;
export default getStorageService;
//# sourceMappingURL=storage.d.ts.map