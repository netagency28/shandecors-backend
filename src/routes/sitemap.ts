import { Router } from 'express';
import { buildSitemapXml } from '../services/sitemap';

const router = Router();

router.get('/sitemap.xml', async (_req, res) => {
  try {
    const xml = await buildSitemapXml();
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.status(200).send(xml);
  } catch (error) {
    console.error('Sitemap generation failed:', error);
    res.status(500).send('Sitemap unavailable');
  }
});

export default router;
