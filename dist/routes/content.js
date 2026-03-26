"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const contentStore_1 = require("../services/contentStore");
const router = (0, express_1.Router)();
const CONTACT_INQUIRIES_PATH = path_1.default.join(process.cwd(), 'data', 'contact-inquiries.json');
const readInquiries = async () => {
    try {
        const raw = await fs_1.promises.readFile(CONTACT_INQUIRIES_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const writeInquiries = async (rows) => {
    const dir = path_1.default.dirname(CONTACT_INQUIRIES_PATH);
    await fs_1.promises.mkdir(dir, { recursive: true });
    await fs_1.promises.writeFile(CONTACT_INQUIRIES_PATH, `${JSON.stringify(rows, null, 2)}\n`, 'utf8');
};
router.post('/contact-inquiry', async (req, res) => {
    try {
        const name = String(req.body?.name || '').trim();
        const email = String(req.body?.email || '').trim().toLowerCase();
        const phone = String(req.body?.phone || '').trim();
        const message = String(req.body?.message || '').trim();
        if (!name || !email || !message) {
            return res.status(400).json({ message: 'name, email and message are required' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ message: 'Please provide a valid email address' });
        }
        const inquiry = {
            id: `inq_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            name,
            email,
            phone,
            message,
            created_at: new Date().toISOString(),
        };
        const rows = await readInquiries();
        rows.unshift(inquiry);
        await writeInquiries(rows.slice(0, 1000));
        return res.status(201).json({ message: 'Your message has been sent successfully.' });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to submit inquiry' });
    }
});
router.get('/:slug', async (req, res) => {
    try {
        const { slug } = req.params;
        const entry = await (0, contentStore_1.readSiteContentEntry)(slug);
        if (!entry) {
            return res.status(404).json({
                message: 'Content page not found',
                allowed_slugs: contentStore_1.ALLOWED_CONTENT_SLUGS,
            });
        }
        return res.json({
            slug,
            ...entry,
        });
    }
    catch (error) {
        return res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to fetch content' });
    }
});
exports.default = router;
//# sourceMappingURL=content.js.map