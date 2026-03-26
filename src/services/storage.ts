import { createClient } from '@supabase/supabase-js';

interface UploadResult {
  url: string;
  path: string;
  error?: string;
}

interface DeleteResult {
  success: boolean;
  error?: string;
}

class StorageService {
  private supabase: any;
  private bucketName: string;

  constructor() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_KEY are required for StorageService');
    }
    
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    this.bucketName = process.env.SUPABASE_STORAGE_BUCKET || 'uploads';
  }

  /**
   * Upload file to Supabase Storage
   */
  async uploadFile(
    file: Buffer,
    fileName: string,
    contentType: string,
    path: string = ''
  ): Promise<UploadResult> {
    try {
      const filePath = path ? `${path}/${fileName}` : fileName;
      
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, {
          contentType,
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        return {
          url: '',
          path: '',
          error: error.message,
        };
      }

      // Get public URL
      const { data: { publicUrl } } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      return {
        url: publicUrl,
        path: filePath,
      };
    } catch (error) {
      return {
        url: '',
        path: '',
        error: error instanceof Error ? error.message : 'Upload failed',
      };
    }
  }

  /**
   * Delete file from Supabase Storage
   */
  async deleteFile(filePath: string): Promise<DeleteResult> {
    try {
      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        return {
          success: false,
          error: error.message,
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Delete failed',
      };
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(filePath: string): string {
    const { data: { publicUrl } } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return publicUrl;
  }

  /**
   * List files in a directory
   */
  async listFiles(path: string = ''): Promise<{ files: string[]; error?: string }> {
    try {
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list(path);

      if (error) {
        return {
          files: [],
          error: error.message,
        };
      }

      const files = data?.map((file: { name: string }) => file.name) || [];
      return { files };
    } catch (error) {
      return {
        files: [],
        error: error instanceof Error ? error.message : 'List failed',
      };
    }
  }
}

let storageService: StorageService | null = null;

export const getStorageService = (): StorageService => {
  if (!storageService) {
    storageService = new StorageService();
  }
  return storageService;
};

export default getStorageService;
