import { Router, Request, Response } from 'express';
import multer from 'multer';
import { getStorageService, buildStoragePath } from '../services/storage';
import { z } from 'zod';

const router = Router();

const ALLOWED_IMAGE_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/;
const ALLOWED_VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-msvideo|ogg)$/;
const ALLOWED_EXT = /\.(jpeg|jpg|png|gif|webp|mp4|webm|mov|avi|ogg)$/i;

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const mimeOk = ALLOWED_IMAGE_MIME.test(file.mimetype) || ALLOWED_VIDEO_MIME.test(file.mimetype);
  const extOk = ALLOWED_EXT.test(file.originalname);
  if (mimeOk && extOk) return cb(null, true);
  cb(new Error('Invalid file type. Allowed: images (jpeg, png, gif, webp) and videos (mp4, webm, mov).'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter,
});

const uploadSchema = z.object({
  type: z.enum(['product', 'category', 'user', 'video', 'site']).default('product'),
});

// POST /api/upload/single
router.post('/single', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { message: 'No file uploaded' } });
    }

    const { type } = uploadSchema.parse(req.body);
    const storagePath = buildStoragePath(type, req.file.originalname, req.file.mimetype);

    const storage = getStorageService();
    const result = await storage.uploadFile(req.file.buffer, storagePath, req.file.mimetype);

    if (result.error) {
      return res.status(500).json({ success: false, error: { message: result.error } });
    }

    return res.json({
      success: true,
      data: {
        url: result.url,
        path: result.path,
        originalName: req.file.originalname,
        size: req.file.size,
        type: req.file.mimetype,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: err instanceof Error ? err.message : 'Upload failed' },
    });
  }
});

// POST /api/upload/multiple
router.post('/multiple', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) {
      return res.status(400).json({ success: false, error: { message: 'No files uploaded' } });
    }

    const { type } = uploadSchema.parse(req.body);
    const storage = getStorageService();

    const results = await Promise.all(
      (req.files as Express.Multer.File[]).map((file) => {
        const storagePath = buildStoragePath(type, file.originalname, file.mimetype);
        return storage.uploadFile(file.buffer, storagePath, file.mimetype);
      })
    );

    const successful = results.filter((r) => !r.error);
    const failed = results.filter((r) => r.error);

    return res.json({
      success: true,
      data: {
        uploaded: successful.map((r) => ({ url: r.url, path: r.path })),
        failed: failed.map((r) => r.error),
        total: (req.files as Express.Multer.File[]).length,
        successful: successful.length,
      },
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: err instanceof Error ? err.message : 'Upload failed' },
    });
  }
});

// DELETE /api/upload/:path
router.delete('/:path(*)', async (req: Request, res: Response) => {
  try {
    const filePath = req.params.path;
    if (!filePath) {
      return res.status(400).json({ success: false, error: { message: 'File path is required' } });
    }

    const storage = getStorageService();
    const result = await storage.deleteFile(filePath);

    if (!result.success) {
      return res.status(500).json({ success: false, error: { message: result.error } });
    }

    return res.json({ success: true, data: { message: 'File deleted successfully' } });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: { message: err instanceof Error ? err.message : 'Delete failed' },
    });
  }
});

export default router;
