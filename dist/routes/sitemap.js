"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const sitemap_1 = require("../services/sitemap");
const router = (0, express_1.Router)();
router.get('/sitemap.xml', async (_req, res) => {
    try {
        const xml = await (0, sitemap_1.buildSitemapXml)();
        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600');
        res.status(200).send(xml);
    }
    catch (error) {
        console.error('Sitemap generation failed:', error);
        res.status(500).send('Sitemap unavailable');
    }
});
exports.default = router;
//# sourceMappingURL=sitemap.js.map