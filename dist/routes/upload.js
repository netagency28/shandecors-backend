"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../services/storage");
const auth_1 = require("../middleware/auth");
const file_validation_1 = require("../utils/file-validation");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
router.use(auth_1.authMiddleware, auth_1.adminMiddleware);
const ALLOWED_IMAGE_MIME = /^image\/(jpeg|jpg|png|gif|webp)$/;
const ALLOWED_VIDEO_MIME = /^video\/(mp4|webm|quicktime|x-msvideo|ogg)$/;
const fileFilter = (_req, file, cb) => {
    const mimeOk = ALLOWED_IMAGE_MIME.test(file.mimetype) || ALLOWED_VIDEO_MIME.test(file.mimetype);
    const extOk = /\.(jpeg|jpg|png|gif|webp|mp4|webm|mov|avi|ogg)$/i.test(file.originalname);
    if (mimeOk && extOk)
        return cb(null, true);
    cb(new Error('Invalid file type. Allowed: images (jpeg, png, gif, webp) and videos (mp4, webm, mov).'));
};
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter,
});
const uploadSchema = zod_1.z.object({
    type: zod_1.z.enum(['product', 'category', 'user', 'video', 'site']).default('product'),
});
const assertValidBuffer = (file) => {
    if (!(0, file_validation_1.validateFileBuffer)(file.buffer, file.mimetype)) {
        throw new Error('File content does not match the declared file type');
    }
};
// POST /api/upload/single
router.post('/single', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: { message: 'No file uploaded' } });
        }
        assertValidBuffer(req.file);
        const { type } = uploadSchema.parse(req.body);
        const storagePath = (0, storage_1.buildStoragePath)(type, req.file.originalname, req.file.mimetype);
        const storage = (0, storage_1.getStorageService)();
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
    }
    catch (err) {
        return res.status(400).json({
            success: false,
            error: { message: err instanceof Error ? err.message : 'Upload failed' },
        });
    }
});
// POST /api/upload/multiple
router.post('/multiple', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, error: { message: 'No files uploaded' } });
        }
        const files = req.files;
        files.forEach(assertValidBuffer);
        const { type } = uploadSchema.parse(req.body);
        const storage = (0, storage_1.getStorageService)();
        const results = await Promise.all(files.map((file) => {
            const storagePath = (0, storage_1.buildStoragePath)(type, file.originalname, file.mimetype);
            return storage.uploadFile(file.buffer, storagePath, file.mimetype);
        }));
        const successful = results.filter((r) => !r.error);
        const failed = results.filter((r) => r.error);
        return res.json({
            success: true,
            data: {
                uploaded: successful.map((r) => ({ url: r.url, path: r.path })),
                failed: failed.map((r) => r.error),
                total: files.length,
                successful: successful.length,
            },
        });
    }
    catch (err) {
        return res.status(400).json({
            success: false,
            error: { message: err instanceof Error ? err.message : 'Upload failed' },
        });
    }
});
// DELETE /api/upload/:path
router.delete('/:path(*)', async (req, res) => {
    try {
        const filePath = req.params.path;
        if (!filePath || filePath.includes('..')) {
            return res.status(400).json({ success: false, error: { message: 'Invalid file path' } });
        }
        const storage = (0, storage_1.getStorageService)();
        const result = await storage.deleteFile(filePath);
        if (!result.success) {
            return res.status(500).json({ success: false, error: { message: result.error } });
        }
        return res.json({ success: true, data: { message: 'File deleted successfully' } });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            error: { message: err instanceof Error ? err.message : 'Delete failed' },
        });
    }
});
exports.default = router;
//# sourceMappingURL=upload.js.map