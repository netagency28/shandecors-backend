"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const storage_1 = require("../services/storage");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
// Configure multer for memory storage
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allowed file types
        const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx/;
        const extname = allowedTypes.test(file.originalname.toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        if (mimetype && extname) {
            return cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only images and documents are allowed.'));
        }
    },
});
// Upload validation schema
const uploadSchema = zod_1.z.object({
    path: zod_1.z.string().optional(),
    type: zod_1.z.enum(['product', 'user', 'document']).default('product'),
});
// POST /api/upload/single - Upload single file
router.post('/single', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: { message: 'No file uploaded' },
            });
        }
        const { path: uploadPath, type } = uploadSchema.parse(req.body);
        const fileName = `${type}/${Date.now()}-${req.file.originalname}`;
        const storageService = (0, storage_1.getStorageService)();
        const result = await storageService.uploadFile(req.file.buffer, fileName, req.file.mimetype, uploadPath);
        if (result.error) {
            return res.status(500).json({
                success: false,
                error: { message: result.error },
            });
        }
        res.json({
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
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: error instanceof Error ? error.message : 'Upload failed' },
        });
    }
});
// POST /api/upload/multiple - Upload multiple files
router.post('/multiple', upload.array('files', 5), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                error: { message: 'No files uploaded' },
            });
        }
        const { path: uploadPath, type } = uploadSchema.parse(req.body);
        const uploadPromises = req.files.map(async (file) => {
            const fileName = `${type}/${Date.now()}-${file.originalname}`;
            const storageService = (0, storage_1.getStorageService)();
            return storageService.uploadFile(file.buffer, fileName, file.mimetype, uploadPath);
        });
        const results = await Promise.all(uploadPromises);
        const successful = results.filter((r) => !r.error);
        const failed = results.filter((r) => r.error);
        res.json({
            success: true,
            data: {
                uploaded: successful.map(r => ({
                    url: r.url,
                    path: r.path,
                })),
                failed: failed.map(r => r.error),
                total: req.files.length,
                successful: successful.length,
            },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: error instanceof Error ? error.message : 'Upload failed' },
        });
    }
});
// DELETE /api/upload/:path - Delete file
router.delete('/:path(*)', async (req, res) => {
    try {
        const filePath = req.params.path;
        const storageService = (0, storage_1.getStorageService)();
        if (!filePath) {
            return res.status(400).json({
                success: false,
                error: { message: 'File path is required' },
            });
        }
        const result = await storageService.deleteFile(filePath);
        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: { message: result.error },
            });
        }
        res.json({
            success: true,
            data: { message: 'File deleted successfully' },
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            error: { message: error instanceof Error ? error.message : 'Delete failed' },
        });
    }
});
exports.default = router;
//# sourceMappingURL=upload.js.map