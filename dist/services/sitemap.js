"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSitemapXml = void 0;
const database_1 = __importDefault(require("./database"));
const SITE_URL = (process.env.FRONTEND_URL || 'https://www.shandecors.store').replace(/\/+$/, '');
const STATIC_PAGES = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/products', changefreq: 'daily', priority: '0.9' },
    { loc: '/about', changefreq: 'monthly', priority: '0.7' },
    { loc: '/contact', changefreq: 'monthly', priority: '0.6' },
    { loc: '/privacy-policy', changefreq: 'monthly', priority: '0.5' },
    { loc: '/terms-and-conditions', changefreq: 'monthly', priority: '0.5' },
    { loc: '/refunds-cancellation-policy', changefreq: 'monthly', priority: '0.5' },
    { loc: '/shipping-policy', changefreq: 'monthly', priority: '0.5' },
];
const escapeXml = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
const buildSitemapXml = async () => {
    const prisma = (0, database_1.default)();
    const products = await prisma.product.findMany({
        where: { isActive: true, deletedAt: null },
        select: { slug: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
    });
    const productEntries = products.map((product) => ({
        loc: `/products/${product.slug}`,
        changefreq: 'weekly',
        priority: '0.8',
        lastmod: product.updatedAt.toISOString().split('T')[0],
    }));
    const entries = [...STATIC_PAGES, ...productEntries];
    const urls = entries
        .map((entry) => {
        const lastmodTag = entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : '';
        return [
            '  <url>',
            `    <loc>${escapeXml(`${SITE_URL}${entry.loc}`)}</loc>`,
            `    <changefreq>${entry.changefreq}</changefreq>`,
            `    <priority>${entry.priority}</priority>`,
            lastmodTag ? `    ${lastmodTag}` : '',
            '  </url>',
        ]
            .filter(Boolean)
            .join('\n');
    })
        .join('\n');
    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        urls,
        '</urlset>',
    ].join('\n');
};
exports.buildSitemapXml = buildSitemapXml;
//# sourceMappingURL=sitemap.js.map