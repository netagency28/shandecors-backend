"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateSiteContentEntry = exports.readSiteContentEntry = exports.writeSiteContent = exports.readSiteContent = exports.ALLOWED_CONTENT_SLUGS = void 0;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
exports.ALLOWED_CONTENT_SLUGS = ['contact', 'terms', 'refunds', 'shipping'];
const CONTENT_PATH = path_1.default.join(process.cwd(), 'data', 'site-content.json');
const isValidSlug = (slug) => exports.ALLOWED_CONTENT_SLUGS.includes(slug);
const isValidEntry = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return false;
    const v = value;
    return typeof v.title === 'string' && typeof v.body === 'string' && typeof v.updated_at === 'string';
};
const toSafeContent = (value) => {
    const fallbackEntry = {
        title: '',
        body: '',
        updated_at: new Date().toISOString(),
    };
    const defaults = {
        contact: { ...fallbackEntry, title: 'Contact Us' },
        terms: { ...fallbackEntry, title: 'Terms and Conditions' },
        refunds: { ...fallbackEntry, title: 'Refunds and Cancellation Policy' },
        shipping: { ...fallbackEntry, title: 'Shipping Policy' },
    };
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return defaults;
    const obj = value;
    for (const slug of exports.ALLOWED_CONTENT_SLUGS) {
        if (isValidEntry(obj[slug])) {
            defaults[slug] = obj[slug];
        }
    }
    return defaults;
};
const readSiteContent = async () => {
    const raw = await fs_1.promises.readFile(CONTENT_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return toSafeContent(parsed);
};
exports.readSiteContent = readSiteContent;
const writeSiteContent = async (content) => {
    const dir = path_1.default.dirname(CONTENT_PATH);
    await fs_1.promises.mkdir(dir, { recursive: true });
    await fs_1.promises.writeFile(CONTENT_PATH, `${JSON.stringify(content, null, 2)}\n`, 'utf8');
};
exports.writeSiteContent = writeSiteContent;
const readSiteContentEntry = async (slug) => {
    if (!isValidSlug(slug))
        return null;
    const content = await (0, exports.readSiteContent)();
    return content[slug];
};
exports.readSiteContentEntry = readSiteContentEntry;
const updateSiteContentEntry = async (slug, payload) => {
    if (!isValidSlug(slug))
        return null;
    const content = await (0, exports.readSiteContent)();
    const existing = content[slug];
    const next = {
        title: typeof payload.title === 'string' ? payload.title : existing.title,
        body: typeof payload.body === 'string' ? payload.body : existing.body,
        updated_at: new Date().toISOString(),
    };
    content[slug] = next;
    await (0, exports.writeSiteContent)(content);
    return next;
};
exports.updateSiteContentEntry = updateSiteContentEntry;
//# sourceMappingURL=contentStore.js.map